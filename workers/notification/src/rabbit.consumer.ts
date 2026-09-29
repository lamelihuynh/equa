import { connect } from 'amqplib';

import { parseDomainEvent } from '@equa/contracts';

import type { NotificationWorker } from './notification.worker.js';

export interface RabbitConsumer {
  close(): Promise<void>;
}

export interface RabbitChannel {
  assertExchange(name: string, type: string, options: { durable: boolean }): Promise<unknown>;
  assertQueue(
    name: string,
    options: { durable: boolean; deadLetterExchange?: string },
  ): Promise<{ queue: string }>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  consume(queue: string, consumer: (message: { content: Buffer } | null) => void): Promise<unknown>;
  ack(message: { content: Buffer }): void;
  nack(message: { content: Buffer }, allUpTo: boolean, requeue: boolean): void;
}

export interface RabbitConnection {
  once(event: 'error' | 'close', listener: () => void): unknown;
  createChannel(): Promise<RabbitChannel>;
  close(): Promise<void>;
}

export type RabbitConnector = (url: string) => Promise<RabbitConnection>;
export type RabbitReconnectReason = 'connect' | 'connection' | 'message';
export interface RabbitReconnectNotice {
  reason: RabbitReconnectReason;
  attempt: number;
  delayMs: number;
}

export function consumeRabbit(
  url: string,
  worker: NotificationWorker,
  reconnectDelayMs = 1_000,
  connector: RabbitConnector = connect,
  reportRecoverableError: (notice: RabbitReconnectNotice) => void = () => undefined,
): RabbitConsumer {
  let stopped = false;
  let connection: RabbitConnection | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;

  const scheduleReconnect = (reason: RabbitReconnectReason): void => {
    if (stopped || retryTimer) return;
    const attempt = reconnectAttempt + 1;
    const delayMs = Math.min(30_000, reconnectDelayMs * 2 ** Math.min(reconnectAttempt, 8));
    reconnectAttempt = attempt;
    try {
      reportRecoverableError({ reason, attempt, delayMs });
    } catch {
      // Diagnostics must not disable broker recovery.
    }
    const failedConnection = connection;
    connection = undefined;
    if (failedConnection) void failedConnection.close().catch(() => undefined);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void open();
    }, delayMs);
  };
  const open = async (): Promise<void> => {
    if (stopped) return;
    let connected: RabbitConnection | undefined;
    try {
      connected = await connector(url);
      connection = connected;
      const activeConnection = connected;
      const onConnectionLost = (): void => {
        if (connection === activeConnection) scheduleReconnect('connection');
      };
      connected.once('error', onConnectionLost);
      connected.once('close', onConnectionLost);
      const channel = await connected.createChannel();
      await channel.assertExchange('equa.domain-events', 'topic', { durable: true });
      await channel.assertExchange('equa.notification-dlx', 'topic', { durable: true });
      const dlq = await channel.assertQueue('equa.notification.dlq', { durable: true });
      await channel.bindQueue(dlq.queue, 'equa.notification-dlx', '#');
      const queue = await channel.assertQueue('equa.notification', {
        durable: true,
        deadLetterExchange: 'equa.notification-dlx',
      });
      await channel.bindQueue(queue.queue, 'equa.domain-events', '#');
      await channel.prefetch(10);
      await channel.consume(queue.queue, (message) => {
        if (!message) return;
        let raw: unknown;
        try {
          raw = JSON.parse(message.content.toString()) as unknown;
        } catch {
          channel.nack(message, false, false);
          return;
        }
        const event = parseDomainEvent(raw);
        if (!event || !isUuid(event.id) || !isUuid(event.ownerId)) {
          channel.nack(message, false, false);
          return;
        }
        void worker
          .ingest(event, {
            ack: () => channel.ack(message),
            nack: (requeue) => channel.nack(message, false, requeue),
          })
          .catch(() => scheduleReconnect('message'));
      });
      reconnectAttempt = 0;
    } catch {
      if (connected) void connected.close().catch(() => undefined);
      scheduleReconnect('connect');
    }
  };
  void open();
  return {
    async close(): Promise<void> {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      if (connection) await connection.close();
      connection = undefined;
    },
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
