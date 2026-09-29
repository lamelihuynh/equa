import { describe, expect, it } from 'vitest';

import { AutomationService } from '../src/automation/automation.service';
import type { LedgerAdapter } from '../src/ledger/ledger.adapter';

const ledger = (fn: LedgerAdapter['createRecurringOccurrence']): LedgerAdapter => ({
  createRecurringOccurrence: fn,
  applySync: () => Promise.resolve({ version: 1 }),
  readFeed: () => Promise.resolve({ events: [] }),
});

describe('AutomationService', () => {
  it('executes anchored monthly occurrences on the last valid UTC calendar day', async () => {
    let now = new Date('2026-01-31T00:00:00.000Z');
    const keys: string[] = [];
    const service = new AutomationService(
      ledger(({ idempotencyKey }) => {
        keys.push(idempotencyKey);
        return Promise.resolve();
      }),
      () => now,
    );
    const rule = service.create('owner', {
      id: 'monthly-rule',
      schedule: 'P1M',
      startsAt: '2026-01-31T00:00:00.000Z',
      payload: {},
    });

    await service.tick();
    expect(rule.nextRunAt.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    now = new Date('2026-02-28T00:00:00.000Z');
    await service.tick();

    expect(keys).toEqual([
      'recurring:monthly-rule:2026-01-31T00:00:00.000Z',
      'recurring:monthly-rule:2026-02-28T00:00:00.000Z',
    ]);
    expect(rule.nextRunAt.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('snapshots a due rule and retries the same deterministic occurrence', async () => {
    let calls = 0;
    const now = new Date('2026-01-02T00:00:00Z');
    const service = new AutomationService(
      ledger(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('temporary')) : Promise.resolve();
      }),
      () => now,
    );
    service.create('owner', {
      id: 'rule',
      schedule: 'P1D',
      startsAt: '2026-01-01T00:00:00Z',
      payload: { amount: 1 },
    });
    await expect(service.tick()).rejects.toThrow('temporary');
    const execution = service.execution('recurring:rule:2026-01-01T00:00:00.000Z');
    expect(execution?.payload).toEqual({ amount: 1 });
    await service.execute(execution!.key);
    expect(calls).toBe(2);
    expect(execution?.completed).toBe(true);
  });

  it('does not run disabled rules', async () => {
    const service = new AutomationService(
      ledger(() => Promise.resolve()),
      () => new Date('2026-01-02T00:00:00Z'),
    );
    service.create('owner', {
      id: 'rule',
      schedule: 'P1D',
      startsAt: '2026-01-01T00:00:00Z',
      payload: {},
    });
    service.disable('owner', 'rule');
    await service.tick();
    expect(service.execution('recurring:rule:2026-01-01T00:00:00.000Z')).toBeUndefined();
  });
});
