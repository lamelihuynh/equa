import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import { LocalStore, type SqliteDatabase } from './local-store';
import { SyncClient, SyncTransportError } from '../sync/sync-client';

class DiskSqlite implements SqliteDatabase {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }
  execAsync(source: string): Promise<void> {
    this.db.exec(source);
    return Promise.resolve();
  }
  runAsync(source: string, ...params: unknown[]) {
    const result = this.db.prepare(source).run(...params.map(sqlValue));
    return Promise.resolve({
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    });
  }
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return Promise.resolve(this.db.prepare(source).all(...params.map(sqlValue)) as T[]);
  }
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}

function sqlValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  )
    return value;
  throw new Error('Unsupported SQLite parameter in test adapter.');
}

const operation = (id: string, expectedVersion = 0) => ({
  id,
  entity: `expense:${id}`,
  expectedVersion,
  payload: { id },
  createdAt: 'not-authoritative',
});

async function withStore(
  test: (store: LocalStore, db: DiskSqlite, path: string) => Promise<void>,
): Promise<void> {
  const path = join(tmpdir(), `equa-mobile-${crypto.randomUUID()}.sqlite`);
  const db = new DiskSqlite(path);
  const store = new LocalStore(db);
  await store.initialize();
  try {
    await test(store, db, path);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
}

describe('LocalStore and SyncClient', () => {
  it('migrates a previous on-disk outbox schema without losing pending work', async () => {
    const path = join(tmpdir(), `equa-mobile-legacy-${crypto.randomUUID()}.sqlite`);
    const legacy = new DiskSqlite(path);
    try {
      await legacy.execAsync(
        'CREATE TABLE sync_operations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, device_id TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER)',
      );
      await legacy.runAsync(
        "INSERT INTO sync_operations (id, owner_id, device_id, payload, state, created_at, attempts) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
        'legacy-op',
        'owner',
        'device',
        JSON.stringify(operation('legacy-op')),
        1,
        2,
      );
      const migrated = new LocalStore(legacy);
      await migrated.initialize();
      const columns = await legacy.getAllAsync<{ name: string }>(
        'PRAGMA table_info(sync_operations)',
      );
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['queue_sequence', 'retry_at', 'dependencies', 'claim_token']),
      );
      const rows = await legacy.getAllAsync<{
        id: string;
        owner_id: string;
        attempts: number;
        state: string;
        dependencies: string;
      }>('SELECT id, owner_id, attempts, state, dependencies FROM sync_operations');
      expect(rows).toEqual([
        { id: 'legacy-op', owner_id: 'owner', attempts: 2, state: 'pending', dependencies: '[]' },
      ]);
      expect(await legacy.getAllAsync<{ user_version: number }>('PRAGMA user_version')).toEqual([
        { user_version: 2 },
      ]);
      legacy.close();
      const reopenedDb = new DiskSqlite(path);
      const reopened = new LocalStore(reopenedDb);
      await expect(reopened.initialize()).resolves.toBeUndefined();
      expect(await reopened.claim('owner', 20, 0)).toHaveLength(1);
      reopenedDb.close();
    } finally {
      legacy.close();
      await rm(path, { force: true });
    }
  });

  it('persists a local-first mutation and its monotonic outbox sequence across a disk reopen', async () => {
    await withStore(async (store, db, path) => {
      await store.mutate('owner', 'device', operation('one'));
      db.close();
      const reopenedDb = new DiskSqlite(path);
      const reopened = new LocalStore(reopenedDb);
      await reopened.initialize();
      const rows = await reopened.claim('owner', 20, 0);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.queueSequence).toBe(1);
      reopenedDb.close();
    });
  });

  it('blocks a dependent operation and uses server response order, not operation timestamps', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', operation('first'));
      await store.mutate('owner', 'device', operation('second'), ['first']);
      const rows = await store.claim('owner', 20, 0);
      expect(rows.map((row) => row.id)).toEqual(['first']);
      await store.complete('owner', 'first', rows[0]!.claimToken!);
      const next = await store.claim('owner', 20, 0);
      expect(next.map((row) => row.id)).toEqual(['second']);
    });
  });

  it('retries network, 429 and 5xx responses while terminal 4xx is not retried', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', operation('retry'));
      const client = new SyncClient(
        store,
        { push: () => Promise.reject(new SyncTransportError(429, 1_000)) },
        () => Promise.resolve('token'),
        () => 0,
      );
      await client.flush('owner');
      expect(await store.claim('owner', 20, 999)).toHaveLength(0);
      expect(await store.claim('owner', 20, 1_000)).toHaveLength(1);
      await store.mutate('owner', 'device', operation('terminal'));
      const terminal = new SyncClient(
        store,
        { push: () => Promise.reject(new SyncTransportError(400)) },
        () => Promise.resolve('token'),
        () => 2_000,
      );
      await terminal.flush('owner');
      expect((await store.claim('owner', 20, 999_999)).map((row) => row.id)).not.toContain(
        'terminal',
      );
    });
  });

  it('refreshes once after an expired token and quarantines an owner on logout', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', operation('refresh'));
      let calls = 0;
      const client = new SyncClient(
        store,
        {
          push: () => {
            calls += 1;
            return calls === 1
              ? Promise.reject(new SyncTransportError(401))
              : Promise.resolve([{ id: 'refresh', status: 'applied' }]);
          },
        },
        (refresh) => Promise.resolve(refresh ? 'rotated' : 'expired'),
        () => 0,
      );
      await client.flush('owner');
      expect(calls).toBe(2);
      await store.mutate('owner', 'device', operation('logout'));
      await store.quarantine('owner');
      expect(await store.claim('owner', 20, 1)).toHaveLength(0);
    });
  });

  it('schedules retries after partial failures and wakes exactly at the retry deadline', async () => {
    vi.useFakeTimers();
    try {
      await withStore(async (store) => {
        let now = 0;
        let calls = 0;
        await store.mutate('owner', 'device', operation('partial'));
        const client = new SyncClient(
          store,
          {
            push: () => {
              calls += 1;
              return Promise.resolve([{ id: 'partial', status: 'failed' }]);
            },
          },
          () => Promise.resolve('token'),
          () => now,
        );
        client.start('owner');
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(1);
        now = 999;
        await vi.advanceTimersByTimeAsync(999);
        expect(calls).toBe(1);
        now = 1_000;
        await vi.advanceTimersByTimeAsync(1);
        expect(calls).toBe(2);
        client.stop();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores a future durable wake-up on startup and replaces it when an earlier row arrives', async () => {
    vi.useFakeTimers();
    try {
      await withStore(async (store) => {
        let now = 0;
        let calls = 0;
        await store.mutate('owner', 'device', operation('future'));
        const claimed = await store.claim('owner', 20, now);
        await store.retry('owner', 'future', claimed[0]!.claimToken!, 5_000, false);
        const client = new SyncClient(
          store,
          { push: () => Promise.resolve([{ id: 'earlier', status: 'applied' }]) },
          () => {
            calls += 1;
            return Promise.resolve('token');
          },
          () => now,
        );
        client.start('owner');
        now = 4_999;
        await vi.advanceTimersByTimeAsync(4_999);
        expect(calls).toBe(0);
        await store.mutate('owner', 'device', operation('earlier'));
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(1);
        client.stop();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts sync when the connectivity adapter reports a false-to-true transition', async () => {
    vi.useFakeTimers();
    try {
      await withStore(async (store) => {
        let report: ((online: boolean) => void) | undefined;
        let pushes = 0;
        await store.mutate('owner', 'device', operation('reconnect'));
        const client = new SyncClient(
          store,
          {
            push: () => {
              pushes += 1;
              return Promise.resolve([{ id: 'reconnect', status: 'applied' }]);
            },
          },
          () => Promise.resolve('token'),
          () => 0,
          {
            subscribe(listener) {
              report = listener;
              listener(false);
              return () => undefined;
            },
          },
        );
        client.start('owner');
        await vi.advanceTimersByTimeAsync(0);
        expect(pushes).toBe(0);
        report?.(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(pushes).toBe(1);
        client.stop();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not busy-loop an unresolved dependency and wakes its successor once it completes', async () => {
    vi.useFakeTimers();
    try {
      await withStore(async (store) => {
        let pushes = 0;
        await store.mutate('owner', 'device', operation('predecessor'));
        await store.mutate('owner', 'device', operation('dependent'), ['predecessor']);
        const predecessor = await store.claim('owner', 20, 0);
        expect(predecessor.map((row) => row.id)).toEqual(['predecessor']);
        const claim = vi.spyOn(store, 'claim');
        const client = new SyncClient(
          store,
          {
            push: () => {
              pushes += 1;
              return Promise.resolve([{ id: 'dependent', status: 'applied' }]);
            },
          },
          () => Promise.resolve('token'),
          () => 0,
        );
        client.start('owner');
        await vi.advanceTimersByTimeAsync(100);
        expect(claim).not.toHaveBeenCalled();
        expect(pushes).toBe(0);
        await store.complete('owner', 'predecessor', predecessor[0]!.claimToken!);
        await vi.advanceTimersByTimeAsync(0);
        expect(pushes).toBe(1);
        await vi.advanceTimersByTimeAsync(100);
        expect(pushes).toBe(1);
        client.stop();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses canonical entity ids and applies each feed event once with a durable checkpoint', async () => {
    await withStore(async (store, db, path) => {
      await store.mutate('owner', 'device', {
        id: 'operation-a',
        entity: 'expense',
        entityId: 'expense-a',
        expectedVersion: 0,
        payload: { local: 'a' },
        createdAt: 'now',
      });
      await store.mutate('owner', 'device', {
        id: 'operation-b',
        entity: 'expense',
        entityId: 'expense-b',
        expectedVersion: 0,
        payload: { local: 'b' },
        createdAt: 'now',
      });
      const localRows = await store.claim('owner', 20, 0);
      for (const row of localRows) await store.complete('owner', row.id, row.claimToken!);
      expect(await store.entity('owner', 'expense:expense-a')).toEqual({ local: 'a' });
      expect(await store.entity('owner', 'expense:expense-b')).toEqual({ local: 'b' });
      const eventA = {
        version: 1,
        id: 'event-a',
        type: 'expense.updated',
        occurredAt: '2026-01-01T00:00:00.000Z',
        ownerId: 'owner',
        correlationId: 'hash-a',
        producer: 'ledger',
        payload: { expenseId: 'expense-a', version: 1, amountMinor: '10' },
      };
      const eventB = {
        ...eventA,
        id: 'event-b',
        payload: { expenseId: 'expense-b', version: 1, amountMinor: '20' },
      };
      await store.applyFeed('owner', 'device', [eventA, eventB], 'cursor-final');
      expect(await store.entity('owner', 'expense:expense-a')).toMatchObject({ amountMinor: '10' });
      expect(await store.entity('owner', 'expense:expense-b')).toMatchObject({ amountMinor: '20' });
      expect(await store.feedCursor('owner', 'device')).toBe('cursor-final');
      await store.applyFeed('owner', 'device', [eventA], undefined);
      expect(await store.feedCursor('owner', 'device')).toBe('cursor-final');
      db.close();
      const reopenedDb = new DiskSqlite(path);
      const reopened = new LocalStore(reopenedDb);
      await reopened.initialize();
      expect(await reopened.feedCursor('owner', 'device')).toBe('cursor-final');
      reopenedDb.close();
    });
  });

  it('defers a remote event while a local pending edit owns the same expense', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', {
        id: 'local-edit',
        entity: 'expense',
        entityId: 'expense-1',
        expectedVersion: 1,
        payload: { expenseId: 'expense-1', version: 2, amountMinor: '99' },
        createdAt: 'now',
      });
      await store.applyFeed(
        'owner',
        'device',
        [
          {
            version: 1,
            id: 'remote-edit',
            type: 'expense.updated',
            occurredAt: '2026-01-01T00:00:00.000Z',
            ownerId: 'owner',
            payload: { expenseId: 'expense-1', version: 3, amountMinor: '120' },
          },
        ],
        'cursor-remote',
      );
      expect(await store.entity('owner', 'expense:expense-1')).toMatchObject({ amountMinor: '99' });
      expect(await store.deferredEventIds('owner', 'device')).toEqual(['remote-edit']);
      const claimed = await store.claim('owner', 20, 0);
      await store.complete('owner', 'local-edit', claimed[0]!.claimToken!);
      expect(await store.entity('owner', 'expense:expense-1')).toMatchObject({
        amountMinor: '120',
      });
      expect(await store.deferredEventIds('owner', 'device')).toEqual([]);
    });
  });

  it('keeps the acknowledged local mutation ahead of an older deferred event', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', {
        id: 'local-edit',
        entity: 'expense',
        entityId: 'expense-1',
        expectedVersion: 1,
        payload: { expenseId: 'expense-1', version: 1, amountMinor: '99' },
        createdAt: 'now',
      });
      await store.applyFeed('owner', 'device', [
        {
          version: 1,
          id: 'older-remote-edit',
          type: 'expense.updated',
          occurredAt: '2026-01-01T00:00:00.000Z',
          ownerId: 'owner',
          payload: { expenseId: 'expense-1', version: 1, amountMinor: '120' },
        },
      ]);
      let pulls = 0;
      const client = new SyncClient(
        store,
        {
          push: () => Promise.resolve([{ id: 'local-edit', status: 'applied', version: 2 }]),
          pull: () => {
            pulls += 1;
            if (pulls > 1) return Promise.reject(new SyncTransportError(503));
            return Promise.resolve({ cursor: 'initial', events: [] });
          },
        },
        () => Promise.resolve('token'),
        () => 0,
      );
      await client.flush('owner');
      expect(await store.entity('owner', 'expense:expense-1')).toEqual({
        expenseId: 'expense-1',
        version: 2,
        amountMinor: '99',
      });
      expect(await store.deferredEventIds('owner', 'device')).toEqual([]);
      client.stop();
    });
  });

  it('pulls the owner feed after a push and persists its checkpoint', async () => {
    await withStore(async (store) => {
      await store.mutate('owner', 'device', operation('local-expense'));
      let pulls = 0;
      const client = new SyncClient(
        store,
        {
          push: () => Promise.resolve([{ id: 'local-expense', status: 'applied' }]),
          pull: (_token, cursor) => {
            pulls += 1;
            return Promise.resolve({
              cursor: cursor ?? 'cursor-1',
              events:
                cursor === undefined
                  ? [
                      {
                        version: 1,
                        id: 'remote-expense-event',
                        type: 'expense.created',
                        occurredAt: '2026-01-01T00:00:00.000Z',
                        ownerId: 'owner',
                        payload: { expenseId: 'remote-expense', version: 1, amountMinor: '7' },
                      },
                    ]
                  : [],
            });
          },
        },
        () => Promise.resolve('token'),
        () => 0,
      );
      await client.flush('owner');
      expect(pulls).toBe(3);
      expect(await store.feedCursor('owner', 'device')).toBe('cursor-1');
      expect(await store.entity('owner', 'expense:remote-expense')).toMatchObject({
        amountMinor: '7',
      });
      client.stop();
    });
  });

  it('creates a stable installation device for a fresh pull-only account and isolates cursors', async () => {
    await withStore(async (store, db, path) => {
      let pulls = 0;
      const transport = {
        push: () => Promise.resolve([]),
        pull: (_token: string, cursor?: string) => {
          pulls += 1;
          return Promise.resolve({
            cursor: cursor ?? 'fresh-cursor',
            events: cursor
              ? []
              : [
                  {
                    version: 1,
                    id: 'fresh-event',
                    type: 'expense.created',
                    occurredAt: '2026-01-01T00:00:00.000Z',
                    ownerId: 'fresh-owner',
                    payload: { expenseId: 'fresh-expense', version: 1, amountMinor: '5' },
                  },
                ],
          });
        },
      };
      const client = new SyncClient(
        store,
        transport,
        () => Promise.resolve('token'),
        () => 0,
      );
      await client.flush('fresh-owner');
      const device = await store.primaryDevice('fresh-owner');
      expect(device).toBeTruthy();
      expect(pulls).toBe(2);
      expect(await store.feedCursor('fresh-owner', device!)).toBe('fresh-cursor');
      expect(await store.feedCursor('other-owner', device!)).toBeUndefined();
      db.close();
      const reopenedDb = new DiskSqlite(path);
      const reopened = new LocalStore(reopenedDb);
      await reopened.initialize();
      expect(await reopened.primaryDevice('fresh-owner')).toBe(device);
      reopenedDb.close();
      client.stop();
    });
  });

  it('retains the prior cursor when a feed page contains a foreign event', async () => {
    await withStore(async (store) => {
      const device = await store.primaryDevice('owner');
      await store.applyFeed('owner', device!, [], 'checkpoint-old');
      const client = new SyncClient(
        store,
        {
          push: () => Promise.resolve([]),
          pull: () =>
            Promise.resolve({
              cursor: 'checkpoint-new',
              events: [
                {
                  version: 1,
                  id: 'foreign-event',
                  type: 'expense.created',
                  occurredAt: '2026-01-01T00:00:00.000Z',
                  ownerId: 'other-owner',
                  payload: { expenseId: 'foreign-expense', version: 1 },
                },
              ],
            }),
        },
        () => Promise.resolve('token'),
        () => 0,
      );
      await expect(client.flush('owner')).resolves.toBeUndefined();
      expect(await store.feedCursor('owner', device!)).toBe('checkpoint-old');
      client.stop();
    });
  });
});
