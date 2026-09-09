import { describe, expect, it } from 'vitest';

import { InMemorySyncReceiptStore, SyncService } from '../src/sync/sync.service';
import { LedgerPermanentError, type LedgerAdapter } from '../src/ledger/ledger.adapter';

describe('SyncService', () => {
  it('does not claim sequence two until sequence one has completed', async () => {
    const receipts = new InMemorySyncReceiptStore();
    const first = await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {});
    expect(first.state).toBe('claimed');
    await receipts.retrySync('owner', 'device', 'first', first.leaseToken!, 'temporary');
    expect((await receipts.reserveSync('owner', 'device', 'second', 'second-hash', {})).state).toBe(
      'blocked',
    );
    const retried = await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {});
    await receipts.completeSync('owner', 'device', 'first', retried.leaseToken!, 1);
    expect((await receipts.reserveSync('owner', 'device', 'second', 'second-hash', {})).state).toBe(
      'claimed',
    );
  });

  it('keeps later ordered operations blocked after a predecessor conflict', async () => {
    const receipts = new InMemorySyncReceiptStore();
    const first = await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {});
    await receipts.conflictSync('owner', 'device', 'first', first.leaseToken!, 'conflict');
    expect((await receipts.reserveSync('owner', 'device', 'second', 'second-hash', {})).state).toBe(
      'blocked',
    );
  });

  it('does not let concurrent successor reservations bypass an unresolved predecessor', async () => {
    const receipts = new InMemorySyncReceiptStore();
    const first = await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {});
    await receipts.retrySync('owner', 'device', 'first', first.leaseToken!, 'temporary');
    const concurrent = await Promise.all([
      receipts.reserveSync('owner', 'device', 'second', 'second-hash', {}),
      receipts.reserveSync('owner', 'device', 'second', 'second-hash', {}),
    ]);
    expect(concurrent.map((result) => result.state)).toEqual(['blocked', 'blocked']);
  });

  it('deduplicates a payload-bound device operation', async () => {
    let calls = 0;
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: () => Promise.resolve({ version: ++calls }),
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const service = new SyncService(adapter);
    const request = {
      version: 1 as const,
      deviceId: 'd',
      operations: [
        { id: 'op', entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'now' },
      ],
    };
    expect((await service.push('owner', request))[0]?.status).toBe('applied');
    expect((await service.push('owner', request))[0]?.version).toBe(1);
    expect(calls).toBe(1);
  });

  it('rejects reused operation identities with different payloads', async () => {
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: () => Promise.resolve({ version: 1 }),
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const service = new SyncService(adapter);
    await service.push('owner', {
      version: 1,
      deviceId: 'd',
      operations: [
        { id: 'op', entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'now' },
      ],
    });
    expect(
      (
        await service.push('owner', {
          version: 1,
          deviceId: 'd',
          operations: [
            {
              id: 'op',
              entity: 'expense',
              expectedVersion: 0,
              payload: { x: 1 },
              createdAt: 'now',
            },
          ],
        })
      )[0]?.status,
    ).toBe('failed');
  });

  it('serializes concurrent duplicate submissions and replays the durable receipt after restart', async () => {
    let calls = 0;
    const receipts = new InMemorySyncReceiptStore();
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: () => new Promise((resolve) => setTimeout(() => resolve({ version: ++calls }), 1)),
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const request = {
      version: 1 as const,
      deviceId: 'd',
      operations: [
        {
          id: 'op',
          entity: 'expense',
          expectedVersion: 7,
          payload: {},
          createdAt: 'old-client-time',
        },
      ],
    };
    const service = new SyncService(adapter, receipts);
    const concurrent = await Promise.all([
      service.push('owner', request),
      service.push('owner', request),
    ]);
    expect(concurrent.flat().filter((result) => result.status === 'applied')).toHaveLength(1);
    expect(calls).toBe(1);
    expect((await new SyncService(adapter, receipts).push('owner', request))[0]?.version).toBe(1);
  });

  it('stops ordered replay after a failed predecessor', async () => {
    const applied: string[] = [];
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: (_owner, _device, operation) => {
        if (operation.id === 'first') return Promise.reject(new Error('temporary'));
        applied.push(operation.id);
        return Promise.resolve({ version: 1 });
      },
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const result = await new SyncService(adapter).push('owner', {
      version: 1,
      deviceId: 'd',
      operations: [
        { id: 'first', entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'late' },
        { id: 'second', entity: 'expense', expectedVersion: 1, payload: {}, createdAt: 'early' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(applied).toEqual([]);
  });

  it('stops a submitted ordered batch after a conflict', async () => {
    const applied: string[] = [];
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: (_owner, _device, operation) => {
        if (operation.id === 'first')
          return Promise.reject(Object.assign(new Error('conflict'), { code: 'CONFLICT' }));
        applied.push(operation.id);
        return Promise.resolve({ version: 1 });
      },
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const result = await new SyncService(adapter).push('owner', {
      version: 1,
      deviceId: 'd',
      operations: [
        { id: 'first', entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'late' },
        { id: 'second', entity: 'expense', expectedVersion: 1, payload: {}, createdAt: 'early' },
      ],
    });
    expect(result).toEqual([{ id: 'first', status: 'conflict' }]);
    expect(applied).toEqual([]);
  });

  it('persists permanent Ledger failures as terminal failed results', async () => {
    const adapter: LedgerAdapter = {
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: () => Promise.reject(new LedgerPermanentError('missing', 'NOT_FOUND', 404)),
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const service = new SyncService(adapter);
    const request = {
      version: 1 as const,
      deviceId: 'd',
      operations: [
        { id: 'op', entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'now' },
      ],
    };
    await expect(service.push('owner', request)).resolves.toEqual([
      { id: 'op', status: 'failed', retryable: false, code: 'NOT_FOUND' },
    ]);
    await expect(service.push('owner', request)).resolves.toEqual([
      { id: 'op', status: 'failed', retryable: false, code: 'NOT_FOUND' },
    ]);
  });

  it('allows a later ordered operation after retaining a terminal predecessor failure', async () => {
    const receipts = new InMemorySyncReceiptStore();
    const first = await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {});
    await receipts.failSync('owner', 'device', 'first', first.leaseToken!, 'NOT_FOUND', 'missing');
    expect((await receipts.reserveSync('owner', 'device', 'second', 'second-hash', {})).state).toBe(
      'claimed',
    );
    expect((await receipts.reserveSync('owner', 'device', 'first', 'first-hash', {})).state).toBe(
      'failed',
    );
  });
});
