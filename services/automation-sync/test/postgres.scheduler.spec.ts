import { describe, expect, it } from 'vitest';

import { PostgresScheduler } from '../src/automation/postgres.scheduler';
import type { AutomationDatabase, ClaimedExecution } from '../src/database/postgres.repository';
import {
  DisabledLedgerAdapter,
  LedgerUnavailableError,
  type LedgerAdapter,
} from '../src/ledger/ledger.adapter';

class SchedulerStore {
  attempts = 0;
  released: Array<{ key: string; consumeAttempt: boolean }> = [];
  available = true;
  constructor(
    private readonly executions: ClaimedExecution[] = [
      { key: 'run', ownerId: 'owner', payload: {}, leaseToken: 'lease' },
    ],
  ) {}
  claimDue(): Promise<ClaimedExecution[]> {
    if (!this.available) return Promise.resolve([]);
    this.attempts += this.executions.length;
    this.available = false;
    return Promise.resolve(this.executions);
  }
  completeExecution(): Promise<void> {
    return Promise.resolve();
  }
  releaseExecution(
    _key: string,
    _leaseToken: string,
    _error: string,
    consumeAttempt = true,
  ): Promise<void> {
    this.released.push({ key: _key, consumeAttempt });
    if (!consumeAttempt) this.attempts -= 1;
    this.available = true;
    return Promise.resolve();
  }
}

const ledger = (create: LedgerAdapter['createRecurringOccurrence']): LedgerAdapter => ({
  availability: 'available',
  createRecurringOccurrence: create,
  applySync: () => Promise.resolve({ version: 1 }),
  readFeed: () => Promise.resolve({ events: [] }),
});

describe('PostgresScheduler recovery policy', () => {
  it('does not claim or burn attempts while the Ledger adapter is disabled', async () => {
    const store = new SchedulerStore();
    await new PostgresScheduler(
      store as unknown as AutomationDatabase,
      new DisabledLedgerAdapter(),
    ).tick();
    expect(store.attempts).toBe(0);
  });

  it('releases an unavailable dependency without consuming its execution attempt and resumes later', async () => {
    const store = new SchedulerStore();
    let available = false;
    const adapter = ledger(() =>
      available
        ? Promise.resolve()
        : Promise.reject(new LedgerUnavailableError('temporarily unavailable')),
    );
    const scheduler = new PostgresScheduler(store as unknown as AutomationDatabase, adapter);
    await scheduler.tick();
    expect(store.released).toEqual([{ key: 'run', consumeAttempt: false }]);
    expect(store.attempts).toBe(0);
    available = true;
    await scheduler.tick();
    expect(store.attempts).toBe(1);
  });

  it('records a retryable Ledger execution failure as an attempt', async () => {
    const store = new SchedulerStore();
    await new PostgresScheduler(
      store as unknown as AutomationDatabase,
      ledger(() => Promise.reject(new Error('temporary'))),
    ).tick();
    expect(store.released).toEqual([{ key: 'run', consumeAttempt: true }]);
    expect(store.attempts).toBe(1);
  });

  it('releases every already-claimed execution when the first call finds Ledger unavailable', async () => {
    const store = new SchedulerStore([
      { key: 'first', ownerId: 'owner', payload: {}, leaseToken: 'lease-one' },
      { key: 'second', ownerId: 'owner', payload: {}, leaseToken: 'lease-two' },
    ]);
    let calls = 0;
    await new PostgresScheduler(
      store as unknown as AutomationDatabase,
      ledger(() => {
        calls += 1;
        return Promise.reject(new LedgerUnavailableError('temporarily unavailable'));
      }),
    ).tick();
    expect(calls).toBe(1);
    expect(store.released).toEqual([
      { key: 'first', consumeAttempt: false },
      { key: 'second', consumeAttempt: false },
    ]);
    expect(store.attempts).toBe(0);
  });
});
