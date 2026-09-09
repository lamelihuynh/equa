import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/main';
import type { AutomationDatabase } from '../src/database/postgres.repository';
import { DisabledLedgerAdapter } from '../src/ledger/ledger.adapter';
import { SyncService } from '../src/sync/sync.service';

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
});
