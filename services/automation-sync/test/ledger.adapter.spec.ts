import { describe, expect, it } from 'vitest';

import {
  HttpLedgerAdapter,
  LedgerUnavailableError,
  LedgerUnsupportedOperationError,
} from '../src/ledger/ledger.adapter.js';
import type { LedgerPermanentError } from '../src/ledger/ledger.adapter.js';

describe('HttpLedgerAdapter', () => {
  it('sends recurring creation through the Ledger service boundary with stable idempotency', async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    await new HttpLedgerAdapter(
      'http://ledger.test',
      'service-secret',
      fetcher,
    ).createRecurringOccurrence({
      idempotencyKey: 'recurring:rule:date',
      ownerId: 'owner',
      payload: { amountMinor: '20', currency: 'VND', payerId: 'owner' },
    });
    expect(requests[0]?.url).toBe('http://ledger.test/internal/expenses');
    expect(requests[0]?.headers.get('x-equa-service-key')).toBe('service-secret');
    expect(requests[0]?.headers.get('idempotency-key')).toBe('recurring:rule:date');
  });

  it('rejects unsupported sync entities before an HTTP write', async () => {
    let calls = 0;
    const fetcher: typeof fetch = () => {
      calls += 1;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const adapter = new HttpLedgerAdapter('http://ledger.test', 'service-secret', fetcher);
    await expect(
      adapter.applySync('owner', 'device', {
        id: 'op',
        entity: 'group',
        expectedVersion: 0,
        payload: {},
        createdAt: 'now',
      }),
    ).rejects.toBeInstanceOf(LedgerUnsupportedOperationError);
    expect(calls).toBe(0);
  });

  it('keeps the operation receipt id separate from the server expense id', async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response('{"version":2}', { status: 200 }));
    };
    const adapter = new HttpLedgerAdapter('http://ledger.test', 'service-secret', fetcher);
    await expect(
      adapter.applySync('owner', 'device', {
        id: 'operation-receipt-id',
        entity: 'expense',
        entityId: 'server-expense-id',
        expectedVersion: 1,
        payload: { action: 'update', description: 'changed' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).resolves.toEqual({ version: 2 });
    expect(requests[0]?.url).toBe('http://ledger.test/internal/sync/expense/server-expense-id');
    expect(requests[0]?.headers.get('idempotency-key')).toBe('operation-receipt-id');
  });

  it('classifies 404 as a permanent typed error while keeping 5xx retryable', async () => {
    const missing = new HttpLedgerAdapter('http://ledger.test', 'service-secret', () =>
      Promise.resolve(new Response('{"code":"EXPENSE_NOT_FOUND"}', { status: 404 })),
    );
    await expect(
      missing.applySync('owner', 'device', {
        id: 'operation',
        entity: 'expense:server-id',
        expectedVersion: 1,
        payload: {},
        createdAt: 'now',
      }),
    ).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
      retryable: false,
    } satisfies Partial<LedgerPermanentError>);
    const unavailable = new HttpLedgerAdapter('http://ledger.test', 'service-secret', () =>
      Promise.resolve(new Response('{}', { status: 503 })),
    );
    await expect(
      unavailable.applySync('owner', 'device', {
        id: 'operation',
        entity: 'expense:server-id',
        expectedVersion: 1,
        payload: {},
        createdAt: 'now',
      }),
    ).rejects.toBeInstanceOf(LedgerUnavailableError);
  });
});
