import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/main';
import type { AutomationDatabase } from '../src/database/postgres.repository';
import { DisabledLedgerAdapter, type LedgerAdapter } from '../src/ledger/ledger.adapter';
import { InMemorySyncReceiptStore, SyncService } from '../src/sync/sync.service';

const secret = 'test-secret-that-is-long-enough';
const ruleId = '11111111-1111-4111-8111-111111111111';
async function token(owner = '22222222-2222-4222-8222-222222222222'): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(owner)
    .setIssuer('equa-identity')
    .setAudience('equa-clients')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('automation HTTP boundary', () => {
  it('keeps liveness public and reports readiness only while dependencies respond', async () => {
    let databaseAvailable = true;
    const db = {
      ping: () =>
        databaseAvailable ? Promise.resolve() : Promise.reject(new Error('database unavailable')),
    } as unknown as AutomationDatabase;
    const adapter: LedgerAdapter = {
      availability: 'available',
      createRecurringOccurrence: () => Promise.resolve(),
      applySync: () => Promise.resolve({ version: 1 }),
      readFeed: () => Promise.resolve({ events: [] }),
    };
    const syncService = new SyncService(adapter, new InMemorySyncReceiptStore());
    const app = await buildServer(secret, db, syncService, adapter);

    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': correlationId },
    });
    expect(health.statusCode).toBe(200);
    expect(health.headers['x-correlation-id']).toBe(correlationId);
    expect(health.json()).toMatchObject({ status: 'ok', service: 'automation-sync' });
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);

    databaseAvailable = false;
    const unavailable = await app.inject({ method: 'GET', url: '/ready' });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      status: 'not_ready',
      checks: { database: false, ledger: true, sync: true },
    });
    await app.close();
  });

  it('authenticates owner-scoped recurring CRUD and rejects stale revisions', async () => {
    let revision = 1;
    const db = {
      createRule: (
        ownerId: string,
        input: { id: string; schedule: string; startsAt: string; payload: Record<string, unknown> },
      ) => Promise.resolve({ ...input, ownerId, revision, disabled: false }),
      readRule: (ownerId: string, id: string) =>
        Promise.resolve(
          id === ruleId && ownerId === '22222222-2222-4222-8222-222222222222'
            ? {
                id,
                ownerId,
                schedule: 'P1D',
                startsAt: '2026-01-01T00:00:00Z',
                payload: {},
                revision,
                disabled: false,
              }
            : undefined,
        ),
      updateRule: (
        _ownerId: string,
        _id: string,
        input: { schedule: string; startsAt: string; payload: Record<string, unknown> },
        expected: number,
      ) =>
        Promise.resolve(
          expected === revision
            ? {
                id: ruleId,
                ownerId: '22222222-2222-4222-8222-222222222222',
                ...input,
                revision: ++revision,
                disabled: false,
              }
            : undefined,
        ),
      disableRule: () => Promise.resolve(true),
    } as unknown as AutomationDatabase;
    const app = await buildServer(secret, db);
    const authorization = `Bearer ${await token()}`;
    const created = await app.inject({
      method: 'POST',
      url: '/v1/recurring',
      headers: { authorization },
      payload: { id: ruleId, schedule: 'P1D', startsAt: '2026-01-01T00:00:00Z', payload: {} },
    });
    expect(created.statusCode).toBe(201);
    const monthly = await app.inject({
      method: 'POST',
      url: '/v1/recurring',
      headers: { authorization },
      payload: {
        id: '44444444-4444-4444-8444-444444444444',
        schedule: 'P1M',
        startsAt: '2026-01-31T00:00:00Z',
        payload: {},
      },
    });
    expect(monthly.statusCode).toBe(201);
    const custom = await app.inject({
      method: 'POST',
      url: '/v1/recurring',
      headers: { authorization },
      payload: {
        id: '55555555-5555-4555-8555-555555555555',
        schedule: 'P2W',
        startsAt: '2026-01-01T00:00:00Z',
        payload: {},
      },
    });
    expect(custom.statusCode).toBe(201);
    const unsupported = await app.inject({
      method: 'POST',
      url: '/v1/recurring',
      headers: { authorization },
      payload: {
        id: '66666666-6666-4666-8666-666666666666',
        schedule: 'P1M2D',
        startsAt: '2026-01-01T00:00:00Z',
        payload: {},
      },
    });
    expect(unsupported.statusCode).toBe(400);
    const timezoneMissing = await app.inject({
      method: 'POST',
      url: '/v1/recurring',
      headers: { authorization },
      payload: {
        id: '77777777-7777-4777-8777-777777777777',
        schedule: 'P1D',
        startsAt: '2026-01-01T00:00:00',
        payload: {},
      },
    });
    expect(timezoneMissing.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/recurring/${ruleId}`,
          headers: {
            authorization: `Bearer ${await token('33333333-3333-4333-8333-333333333333')}`,
          },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/v1/recurring/${ruleId}`,
          headers: { authorization },
          payload: { schedule: 'P1D', startsAt: '2026-01-02T00:00:00Z', payload: {}, revision: 0 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/v1/recurring/${ruleId}`,
          headers: { authorization },
        })
      ).statusCode,
    ).toBe(204);
    await app.close();
  });

  it('rejects unauthenticated sync and reports unavailable Ledger as retryable 503', async () => {
    const app = await buildServer(
      secret,
      {} as AutomationDatabase,
      new SyncService(new DisabledLedgerAdapter()),
    );
    expect((await app.inject({ method: 'POST', url: '/v1/sync', payload: {} })).statusCode).toBe(
      401,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: { authorization: `Bearer ${await token()}` },
      payload: {
        version: 1,
        deviceId: 'device',
        operations: [
          { id: ruleId, entity: 'expense', expectedVersion: 0, payload: {}, createdAt: 'x' },
        ],
      },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('rate limits authenticated sync requests by owner', async () => {
    const app = await buildServer(
      secret,
      undefined,
      new SyncService(new DisabledLedgerAdapter(), new InMemorySyncReceiptStore()),
      undefined,
      { rateLimitMax: 2 },
    );
    const authorization = `Bearer ${await token()}`;
    const request = {
      method: 'POST' as const,
      url: '/v1/sync',
      headers: { authorization },
      payload: {},
    };

    expect((await app.inject(request)).statusCode).toBe(400);
    expect((await app.inject(request)).statusCode).toBe(400);
    expect((await app.inject(request)).statusCode).toBe(429);
    await app.close();
  });

  it('requires an authenticated explicit discard before a server-side conflict stops blocking successors', async () => {
    const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const nextOperationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let conflict = true;
    const syncService = new SyncService(
      {
        createRecurringOccurrence: () => Promise.resolve(),
        applySync: (_owner, _device, operation) =>
          operation.id === operationId && conflict
            ? Promise.reject(Object.assign(new Error('stale version'), { code: 'CONFLICT' }))
            : Promise.resolve({ version: 2 }),
        readFeed: () => Promise.resolve({ events: [] }),
      },
      new InMemorySyncReceiptStore(),
    );
    const app = await buildServer(secret, undefined, syncService);
    const authorization = `Bearer ${await token()}`;
    const firstPayload = {
      version: 1,
      deviceId: 'device-1',
      operations: [
        {
          id: operationId,
          entity: 'expense',
          expectedVersion: 1,
          payload: {},
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/sync',
          headers: { authorization },
          payload: firstPayload,
        })
      ).json(),
    ).toEqual([{ id: operationId, status: 'conflict' }]);

    const nextPayload = {
      version: 1,
      deviceId: 'device-1',
      operations: [
        {
          id: nextOperationId,
          entity: 'expense',
          expectedVersion: 2,
          payload: {},
          createdAt: '2026-01-01T00:00:01.000Z',
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/sync',
          headers: { authorization },
          payload: nextPayload,
        })
      ).json(),
    ).toMatchObject([{ status: 'failed', retryable: true, code: 'SYNC_BLOCKED' }]);

    const resolution = {
      version: 1,
      deviceId: 'device-1',
      operationId,
      resolution: 'discard',
    };
    const resolved = await app.inject({
      method: 'POST',
      url: `/v1/sync/conflicts/${operationId}/resolve`,
      headers: { authorization },
      payload: resolution,
    });
    expect(resolved.json()).toEqual({ operationId, state: 'discarded' });
    expect(resolved.statusCode).toBe(200);
    const repeatedResolution = await app.inject({
      method: 'POST',
      url: `/v1/sync/conflicts/${operationId}/resolve`,
      headers: { authorization },
      payload: resolution,
    });
    expect(repeatedResolution.statusCode).toBe(200);
    expect(repeatedResolution.json()).toEqual({ operationId, state: 'discarded' });

    conflict = false;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/sync',
          headers: { authorization },
          payload: nextPayload,
        })
      ).json(),
    ).toEqual([{ id: nextOperationId, status: 'applied', version: 2 }]);
    await app.close();
  });
});
