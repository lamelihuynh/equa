import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { AutomationDatabase } from '../src/database/postgres.repository.js';

interface RecordedQuery {
  text: string;
  values?: readonly unknown[];
}

function databaseWithRecorder(): { database: AutomationDatabase; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];
  const query = (text: string, values?: readonly unknown[]) => {
    queries.push({ text, values });
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
  const client = { query, release: () => undefined };
  const pool = { query, connect: () => Promise.resolve(client) } as unknown as Pool;
  return { database: new AutomationDatabase('postgres://unused', pool), queries };
}

describe('AutomationDatabase recurring retry terminal state', () => {
  it('moves already exhausted pending or expired leases to dead before claiming', async () => {
    const { database, queries } = databaseWithRecorder();
    await database.claimDue(new Date('2026-01-01T00:00:00.000Z'));

    expect(queries[1]?.text).toContain("SET status = 'dead'");
    expect(queries[1]?.text).toContain('attempts >= 8');
    expect(queries[1]?.values).toEqual([new Date('2026-01-01T00:00:00.000Z')]);
  });

  it('loads the persisted recurrence anchor and schedule for the next occurrence', async () => {
    const { database, queries } = databaseWithRecorder();
    await database.claimDue(new Date('2026-01-01T00:00:00.000Z'));

    expect(queries[3]?.text).toContain('schedule_anchor_at');
    expect(queries[3]?.text).toContain('schedule');
    expect(queries.some((query) => query.text.includes("INTERVAL '1 day'"))).toBe(false);
  });

  it('resolves only an explicitly discarded owner/device conflict', async () => {
    const { database, queries } = databaseWithRecorder();
    await database.resolveSyncConflict(
      'owner-id',
      'device-id',
      '00000000-0000-4000-8000-000000000001',
    );

    expect(queries[0]?.text).toContain("SET status = 'failed'");
    expect(queries[0]?.text).toContain("status = 'conflict'");
    expect(queries[0]?.text).toContain("failure_code = 'USER_DISCARDED'");
    expect(queries[0]?.values).toEqual([
      'owner-id',
      'device-id',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('marks the final failed claim dead while unavailable dependency releases stay retryable', async () => {
    const { database, queries } = databaseWithRecorder();
    await database.releaseExecution('key', 'lease', 'failure', true);
    await database.releaseExecution('key', 'lease', 'unavailable', false);

    expect(queries[0]?.text).toContain("CASE WHEN $4 AND attempts >= 8 THEN 'dead'");
    expect(queries[0]?.values).toEqual(['key', 'lease', 'failure', true]);
    expect(queries[1]?.text).toContain("CASE WHEN $4 AND attempts >= 8 THEN 'dead'");
    expect(queries[1]?.values).toEqual(['key', 'lease', 'unavailable', false]);
  });
});
