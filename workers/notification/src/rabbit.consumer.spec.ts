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
});
