import { describe, expect, it } from 'vitest';

import { AmqpLedgerEventPublisher } from '../src/rabbit.publisher.js';
import type { LedgerOutboxEvent } from '../src/types.js';

const event: LedgerOutboxEvent = {
  id: 'event-id',
  version: 1,
  type: 'expense.created',
  occurredAt: '2026-01-01T00:00:00.000Z',
  ownerId: 'owner-id',
  correlationId: 'request-hash',
  producer: 'ledger',
  payload: { expenseId: 'expense-id', version: 1 },
};

describe('AmqpLedgerEventPublisher', () => {
  it('uses a durable topic and publisher confirms', async () => {
    const published: Array<{ exchange: string; routingKey: string; body: Buffer }> = [];
    let confirmed = 0;
    let closed = 0;
    const channel = {
      assertExchange: (name: string, type: string, options: { durable: boolean }) => {
        expect(name).toBe('equa.domain-events');
        expect(type).toBe('topic');
        expect(options.durable).toBe(true);
        return Promise.resolve({});
      },
      publish: (exchange: string, routingKey: string, body: Buffer) => {
        published.push({ exchange, routingKey, body });
        return true;
      },
      waitForConfirms: () => {
        confirmed += 1;
        return Promise.resolve();
      },
    };
    const connection = {
      createConfirmChannel: () => Promise.resolve(channel),
      once: () => connection,
      close: () => {
        closed += 1;
        return Promise.resolve();
      },
    };
    const publisher = new AmqpLedgerEventPublisher('amqp://ledger.test', 1_000, () =>
      Promise.resolve(connection as never),
    );
    await publisher.publish(event);
    expect(published[0]?.exchange).toBe('equa.domain-events');
    expect(published[0]?.routingKey).toBe('expense.created');
    expect(JSON.parse(published[0]!.body.toString())).toEqual(event);
    expect(confirmed).toBe(1);
    await publisher.close();
    expect(closed).toBe(1);
  });

  it('surfaces a publish failure so the fenced outbox can retry it', async () => {
    const channel = {
      assertExchange: () => Promise.resolve({}),
      publish: () => {
        throw new Error('broker unavailable');
      },
      waitForConfirms: () => Promise.resolve(),
    };
    const connection = {
      createConfirmChannel: () => Promise.resolve(channel),
      once: () => connection,
      close: () => Promise.resolve(),
    };
    const publisher = new AmqpLedgerEventPublisher('amqp://ledger.test', 1_000, () =>
      Promise.resolve(connection as never),
    );
    await expect(publisher.publish(event)).rejects.toThrow('broker unavailable');
    await publisher.close();
  });
});
