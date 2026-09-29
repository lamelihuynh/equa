import { describe, expect, it } from 'vitest';

import { postgresIdempotencyLockKey } from '../src/database/postgres.repository.js';

describe('Ledger PostgreSQL advisory lock key', () => {
  it('encodes owner and idempotency key as valid, unambiguous PostgreSQL text', () => {
    const first = postgresIdempotencyLockKey('owner\u0000tail', 'request');
    const second = postgresIdempotencyLockKey('owner', 'tail\u0000request');

    expect(first).not.toContain('\u0000');
    expect(second).not.toContain('\u0000');
    expect(first).not.toBe(second);
    expect(first).toBe('["owner\\u0000tail","request"]');
  });
});
