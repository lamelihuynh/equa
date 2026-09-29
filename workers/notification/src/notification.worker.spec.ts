import { describe, expect, it, vi } from 'vitest';

import { InMemoryNotificationStore } from './in-memory.store';
import {
  DisabledNotificationProvider,
  NotificationWorker,
  ProviderDeliveryError,
  type NotificationProvider,
} from './notification.worker';

const actorId = '00000000-0000-4000-8000-000000000001';
const firstParticipantId = '00000000-0000-4000-8000-000000000002';
const secondParticipantId = '00000000-0000-4000-8000-000000000003';
const event = (id = 'event-1', addedParticipantIds: string[] = [firstParticipantId]) => ({
  version: 1 as const,
  id,
  type: 'expense.created',
  occurredAt: '2026-01-01T00:00:00Z',
  ownerId: actorId,
  payload: { actorId, addedParticipantIds },
});
const message = { ack: () => undefined, nack: () => undefined };
const enabled = (deliver: NotificationProvider['deliver']): NotificationProvider => ({
  enabled: true,
  deliver,
});

describe('NotificationWorker', () => {
  it('acks durable duplicate events once and delivers their job once', async () => {
    const store = new InMemoryNotificationStore();
    let deliveries = 0;
    const worker = new NotificationWorker(
      store,
      enabled(() => {
        deliveries += 1;
        return Promise.resolve();
      }),
    );
    await worker.ingest(event(), message);
    await worker.ingest(event(), message);
    await worker.deliverOne();
    await worker.deliverOne();
    expect(deliveries).toBe(1);
  });

  it('creates one idempotent job per newly added participant, excluding the actor', async () => {
    const store = new InMemoryNotificationStore();
    const delivered: Array<{ recipientId: string; idempotencyKey: string }> = [];
    const worker = new NotificationWorker(
      store,
      enabled((job, idempotencyKey) => {
        delivered.push({ recipientId: job.ownerId, idempotencyKey });
        return Promise.resolve();
      }),
    );
    const notificationEvent = event('event-multi', [
      secondParticipantId,
      actorId,
      firstParticipantId,
      firstParticipantId,
    ]);
    await worker.ingest(notificationEvent, message);
    await worker.ingest(notificationEvent, message);
    await worker.deliverOne();
    await worker.deliverOne();
    await worker.deliverOne();

    expect(delivered).toEqual([
      {
        recipientId: firstParticipantId,
        idempotencyKey: `notification:event-multi:${firstParticipantId}`,
      },
      {
        recipientId: secondParticipantId,
        idempotencyKey: `notification:event-multi:${secondParticipantId}`,
      },
    ]);
    expect(store.count()).toBe(0);
  });

  it('fences stale lease completion and permits only one concurrent claim', async () => {
    const store = new InMemoryNotificationStore();
    await store.persistInboxAndJobs(event(), [
      {
        eventId: 'event-1',
        deliveryId: `notification:event-1:${firstParticipantId}`,
        ownerId: firstParticipantId,
        type: 'expense.created',
        payload: {},
      },
    ]);
    const first = await store.claimDue(new Date('2026-01-01T00:00:00Z'));
    const second = await store.claimDue(new Date('2026-01-01T00:00:00Z'));
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    await store.complete(first!.deliveryId, 'stale-token');
    expect(store.count()).toBe(1);
    await store.complete(first!.deliveryId, first!.leaseToken);
    expect(store.count()).toBe(0);
  });

  it('reclaims an expired lease with a fresh fencing token', async () => {
    const store = new InMemoryNotificationStore();
    await store.persistInboxAndJobs(event(), [
      {
        eventId: 'event-1',
        deliveryId: `notification:event-1:${firstParticipantId}`,
        ownerId: firstParticipantId,
        type: 'expense.created',
        payload: {},
      },
    ]);
    const first = await store.claimDue(new Date('2026-01-01T00:00:00Z'));
    const reclaimed = await store.claimDue(new Date('2026-01-01T00:00:31Z'));
    expect(reclaimed?.leaseToken).not.toBe(first?.leaseToken);
  });

  it('keeps 429 and 5xx provider failures retryable', async () => {
    for (const status of [429, 503]) {
      const store = new InMemoryNotificationStore();
      const now = new Date('2026-01-01T00:00:00Z');
      const worker = new NotificationWorker(
        store,
        enabled(() => Promise.reject(new ProviderDeliveryError(status, 1_000))),
        () => now,
      );
      await worker.ingest(event(`event-${status}`), message);
      await worker.deliverOne();
      expect(store.count()).toBe(1);
      const due = await store.claimDue(new Date(now.valueOf() + 1_001));
      expect(due).toBeDefined();
    }
  });

  it('does not claim jobs while the provider is disabled', async () => {
    const store = new InMemoryNotificationStore();
    const worker = new NotificationWorker(store, new DisabledNotificationProvider());
    await worker.ingest(event(), message);
    await worker.deliverOne();
    expect(store.count()).toBe(1);
    expect(store.claims).toBe(0);
  });

  it('moves an exhausted retryable job to dead and never claims it again', async () => {
    const store = new InMemoryNotificationStore();
    let now = new Date('2026-01-01T00:00:00Z');
    const worker = new NotificationWorker(
      store,
      enabled(() => Promise.reject(new ProviderDeliveryError(503))),
      () => now,
    );
    await worker.ingest(event('exhausted'), message);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await worker.deliverOne();
      now = new Date(now.valueOf() + 300_001);
    }
    expect(store.count()).toBe(0);
    const claims = store.claims;
    await worker.deliverOne();
    expect(store.claims).toBe(claims);
  });

  it('keeps the polling loop recoverable when a database call rejects', async () => {
    vi.useFakeTimers();
    try {
      let errors = 0;
      const store = {
        persistInboxAndJobs: () => Promise.resolve<'inserted'>('inserted'),
        claimDue: () => Promise.reject(new Error('database unavailable')),
        complete: () => Promise.resolve(),
        retry: () => Promise.resolve(),
      };
      const worker = new NotificationWorker(
        store,
        enabled(() => Promise.resolve()),
        () => new Date(),
        () => {
          errors += 1;
        },
      );
      const stop = worker.start(10);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);
      expect(errors).toBeGreaterThanOrEqual(2);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports failed event persistence and sends the event to the broker DLQ', async () => {
    const stages: string[] = [];
    let requeue: boolean | undefined;
    const store = {
      persistInboxAndJobs: () => Promise.reject(new Error('database unavailable')),
      claimDue: () => Promise.resolve(undefined),
      complete: () => Promise.resolve(),
      retry: () => Promise.resolve(),
    };
    const worker = new NotificationWorker(
      store,
      new DisabledNotificationProvider(),
      () => new Date(),
      (stage) => stages.push(stage),
    );
    await worker.ingest(event(), {
      ack: () => undefined,
      nack: (shouldRequeue) => {
        requeue = shouldRequeue;
      },
    });
    expect(stages).toEqual(['ingest']);
    expect(requeue).toBe(false);
  });
});
