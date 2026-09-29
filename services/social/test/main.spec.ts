import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/main.js';
import { InMemorySocialRepository } from '../src/social.repository.js';
import type { IdentityDirectory } from '../src/identity-adapter.js';
import type { SocialLedgerAdapter } from '../src/ledger-adapter.js';

async function token(secret: string, id: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer('equa-identity')
    .setAudience('equa-clients')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));
}

describe('Social HTTP boundary', () => {
  it('requires Identity JWT auth and exposes service-only membership checks', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = {
      resolveIdentifier: (value) =>
        Promise.resolve(
          value.includes('bob') ? { id: 'bob', email: 'bob@example.test' } : undefined,
        ),
    };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        Promise.resolve({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => Promise.resolve(false),
      hasOutstandingGroupDebt: () => Promise.resolve(false),
    };
    const app = await buildServer('secret', {
      repository,
      identity,
      ledger,
      serviceKey: 'service-secret',
    });
    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': correlationId },
    });
    expect(health.headers['x-correlation-id']).toBe(correlationId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/groups',
          payload: { name: 'Trip', type: 'trip' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/friends/requests',
          payload: { identifier: 'bob@example.test' },
        })
      ).statusCode,
    ).toBe(401);
    const auth = {
      authorization: `Bearer ${await token('secret', 'alice', 'alice@example.test')}`,
    };
    const group = await app.inject({
      method: 'POST',
      url: '/v1/groups',
      headers: auth,
      payload: { name: 'Trip', type: 'trip' },
    });
    expect(group.statusCode).toBe(201);
    const groupId = group.json<{ id: string }>().id;
    const ownGroups = await app.inject({ method: 'GET', url: '/v1/groups', headers: auth });
    expect(ownGroups.statusCode).toBe(200);
    expect(ownGroups.json<Array<{ id: string }>>().map((item) => item.id)).toEqual([groupId]);
    const otherUserGroups = await app.inject({
      method: 'GET',
      url: '/v1/groups',
      headers: {
        authorization: `Bearer ${await token('secret', 'bob', 'bob@example.test')}`,
      },
    });
    expect(otherUserGroups.json()).toEqual([]);
    const internal = await app.inject({
      method: 'POST',
      url: '/internal/groups/member',
      headers: { 'x-equa-service-key': 'service-secret' },
      payload: { groupId, userId: 'alice' },
    });
    expect(internal.json()).toEqual({ member: true });
    const forbiddenInternal = await app.inject({
      method: 'POST',
      url: '/internal/groups/member',
      headers: { 'x-equa-service-key': 'wrong-key' },
      payload: { groupId, userId: 'alice' },
    });
    expect(forbiddenInternal.statusCode).toBe(403);
    const dissolved = await app.inject({
      method: 'DELETE',
      url: `/v1/groups/${groupId}`,
      headers: auth,
    });
    expect(dissolved.statusCode).toBe(204);
    const afterDissolve = await app.inject({ method: 'GET', url: '/v1/groups', headers: auth });
    expect(afterDissolve.json()).toEqual([]);
    await app.close();
  });
});
