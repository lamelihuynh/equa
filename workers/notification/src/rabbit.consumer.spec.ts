import { describe, expect, it, vi } from 'vitest';

import { consumeRabbit, type RabbitChannel, type RabbitConnection } from './rabbit.consumer';
import { InMemoryNotificationStore } from './in-memory.store';
import { DisabledNotificationProvider, NotificationWorker } from './notification.worker';

describe('Rabbit consumer', () => {
  it('retries a failed connection and cleans up the recovered connection', async () => {
    vi.useFakeTimers();
    try {
      const channel: RabbitChannel = {
        assertExchange: () => Promise.resolve(),
        assertQueue: (name) => Promise.resolve({ queue: name }),
        bindQueue: () => Promise.resolve(),
        prefetch: () => Promise.resolve(),
        consume: () => Promise.resolve(),
        ack: () => undefined,
        nack: () => undefined,
      };
      let closed = false;
      const connection: RabbitConnection = {
        once: () => undefined,
        createChannel: () => Promise.resolve(channel),
        close: () => {
          closed = true;
          return Promise.resolve();
        },
      };
      let attempts = 0;
      const consumer = consumeRabbit(
        'amqp://test',
        new NotificationWorker(new InMemoryNotificationStore(), new DisabledNotificationProvider()),
        25,
        () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error('broker unavailable'))
            : Promise.resolve(connection);
        },
      );
      await vi.advanceTimersByTimeAsync(26);
      expect(attempts).toBe(2);
      await consumer.close();
      expect(closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports bounded exponential reconnect delays after repeated broker failures', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const notices: Array<{ reason: string; attempt: number; delayMs: number }> = [];
      const consumer = consumeRabbit(
        'amqp://test',
        new NotificationWorker(new InMemoryNotificationStore(), new DisabledNotificationProvider()),
        25,
        () => {
          attempts += 1;
          return Promise.reject(new Error('broker unavailable'));
        },
        (notice) => notices.push(notice),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);
      expect(notices.map(({ delayMs }) => delayMs)).toEqual([25]);
      await vi.advanceTimersByTimeAsync(25);
      expect(attempts).toBe(2);
      expect(notices.map(({ delayMs }) => delayMs)).toEqual([25, 50]);
      await vi.advanceTimersByTimeAsync(50);
      expect(attempts).toBe(3);
      expect(notices.map(({ delayMs }) => delayMs)).toEqual([25, 50, 100]);
      await consumer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores delayed close events from a superseded Rabbit connection', async () => {
    vi.useFakeTimers();
    try {
      const channel: RabbitChannel = {
        assertExchange: () => Promise.resolve(),
        assertQueue: (name) => Promise.resolve({ queue: name }),
        bindQueue: () => Promise.resolve(),
        prefetch: () => Promise.resolve(),
        consume: () => Promise.resolve(),
        ack: () => undefined,
        nack: () => undefined,
      };
      let oldError: (() => void) | undefined;
      let oldClose: (() => void) | undefined;
      let attempts = 0;
      const consumer = consumeRabbit(
        'amqp://test',
        new NotificationWorker(new InMemoryNotificationStore(), new DisabledNotificationProvider()),
        25,
        () => {
          attempts += 1;
          return Promise.resolve({
            once: (event, listener) => {
              if (attempts === 1 && event === 'error') oldError = listener;
              if (attempts === 1 && event === 'close') oldClose = listener;
            },
            createChannel: () => Promise.resolve(channel),
            close: () => Promise.resolve(),
          });
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      oldError?.();
      await vi.advanceTimersByTimeAsync(25);
      expect(attempts).toBe(2);
      oldClose?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(attempts).toBe(2);
      await consumer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers when a message acknowledgement promise rejects', async () => {
    vi.useFakeTimers();
    try {
      let receive: ((message: { content: Buffer } | null) => void) | undefined;
      const channel: RabbitChannel = {
        assertExchange: () => Promise.resolve(),
        assertQueue: (name) => Promise.resolve({ queue: name }),
        bindQueue: () => Promise.resolve(),
        prefetch: () => Promise.resolve(),
        consume: (_queue, callback) => {
          receive = callback;
          return Promise.resolve();
        },
        ack: () => {
          throw new Error('channel closed during ack');
        },
        nack: () => {
          throw new Error('channel closed during nack');
        },
      };
      const connection: RabbitConnection = {
        once: () => undefined,
        createChannel: () => Promise.resolve(channel),
        close: () => Promise.resolve(),
      };
      let connections = 0;
      const consumer = consumeRabbit(
        'amqp://test',
        new NotificationWorker(new InMemoryNotificationStore(), new DisabledNotificationProvider()),
        25,
        () => {
          connections += 1;
          return Promise.resolve(connection);
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      receive?.({
        content: Buffer.from(
          JSON.stringify({
            version: 1,
            id: '00000000-0000-4000-8000-000000000001',
            type: 'expense.created',
            occurredAt: '2026-01-01T00:00:00.000Z',
            ownerId: '00000000-0000-4000-8000-000000000002',
            payload: {},
          }),
        ),
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(25);
      expect(connections).toBe(2);
      await consumer.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
