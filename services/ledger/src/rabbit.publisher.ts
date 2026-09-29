import { connect } from 'amqplib';

import type { LedgerOutboxEvent } from './types.js';
import type { LedgerEventPublisher } from './outbox.publisher.js';

export interface RabbitLedgerPublisher {
  publish(event: LedgerOutboxEvent): Promise<void>;
  close(): Promise<void>;
}

interface ConfirmChannelLike {
  assertExchange(name: string, type: string, options: { durable: boolean }): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: { contentType: string; deliveryMode: number; persistent: boolean },
  ): boolean;
  waitForConfirms(): Promise<void>;
}

interface ConnectionLike {
  createConfirmChannel(): Promise<ConfirmChannelLike>;
  once(event: 'error' | 'close', listener: () => void): unknown;
  close(): Promise<void>;
}

export type RabbitConnector = (url: string) => Promise<ConnectionLike>;

/**
 * Durable, confirm-mode publisher for the Ledger outbox. A broker outage is
 * surfaced to the outbox worker; the worker owns retry and lease fencing.
 */
export class AmqpLedgerEventPublisher implements LedgerEventPublisher, RabbitLedgerPublisher {
  private connection: ConnectionLike | undefined;
  private channel: ConfirmChannelLike | undefined;
  private opening: Promise<void> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private reconnecting = false;

  constructor(
    private readonly url: string,
    private readonly reconnectDelayMs = 1_000,
    private readonly connector: RabbitConnector = (value) => connect(value),
  ) {}

  async publish(event: LedgerOutboxEvent): Promise<void> {
    if (this.stopped) throw new Error('Ledger AMQP publisher is closed.');
    await this.ensureChannel();
    const channel = this.channel;
    if (!channel) throw new Error('Ledger AMQP channel is unavailable.');
    try {
      channel.publish(
        'equa.domain-events',
        event.type,
        Buffer.from(JSON.stringify(event), 'utf8'),
        { contentType: 'application/json', deliveryMode: 2, persistent: true },
      );
      await channel.waitForConfirms();
    } catch (error) {
      this.invalidateConnection();
      throw error instanceof Error ? error : new Error('Ledger AMQP publish failed.');
    }
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const connection = this.connection;
    this.invalidateConnection(false);
    if (connection) await connection.close();
  }

  private async ensureChannel(): Promise<void> {
    if (this.channel) return;
    if (this.opening) return this.opening;
    this.opening = this.open()
      .catch((error) => {
        this.scheduleReconnect();
        throw error;
      })
      .finally(() => {
        this.opening = undefined;
      });
    return this.opening;
  }

  private async open(): Promise<void> {
    if (this.stopped) throw new Error('Ledger AMQP publisher is closed.');
    const connection = await this.connector(this.url);
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange('equa.domain-events', 'topic', { durable: true });
    connection.once('error', () => this.onConnectionLost(connection));
    connection.once('close', () => this.onConnectionLost(connection));
    this.connection = connection;
    this.channel = channel;
  }

  private onConnectionLost(connection: ConnectionLike): void {
    if (this.connection !== connection || this.stopped) return;
    this.invalidateConnection();
    this.scheduleReconnect();
  }

  private invalidateConnection(schedule = true): void {
    this.channel = undefined;
    this.connection = undefined;
    if (schedule) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnecting || this.reconnectTimer) return;
    this.reconnecting = true;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnecting = false;
      void this.ensureChannel().catch(() => undefined);
    }, this.reconnectDelayMs);
  }
}
