import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { InMemoryExpenseRepository } from '../src/expense.repository.js';
import { buildLedgerServer } from '../src/main.server.js';
import type { LedgerSocialAdapter } from '../src/social-adapter.js';

const ownerId = '00000000-0000-4000-8000-000000000001';
const counterpartyId = '00000000-0000-4000-8000-000000000002';
const expenseId = '00000000-0000-4000-8000-000000000003';

async function token(secret: string, id: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer('equa-identity')
    .setAudience('equa-clients')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));
}

describe('Ledger HTTP boundary', () => {
  it('creates an authenticated integer expense and protects internal routes with a service key', async () => {
    const social: LedgerSocialAdapter = {
      isGroupMember: () => Promise.resolve(true),
      isGroupAdmin: () => Promise.resolve(true),
      isFriend: () => Promise.resolve(true),
    };
    const app = await buildLedgerServer('secret', {
      repository: new InMemoryExpenseRepository(),
      social,
      serviceKey: 'service-secret',
    });
    const authorization = `Bearer ${await token('secret', ownerId, 'alice@example.test')}`;
    const result = await app.inject({
      method: 'POST',
      url: '/v1/expenses',
      headers: { authorization, 'idempotency-key': 'expense-1' },
      payload: {
        amountMinor: '9007199254740992',
        currency: 'VND',
        payerId: ownerId,
        participants: [{ userId: ownerId, shareMinor: '9007199254740992' }],
      },
    });
    expect(result.statusCode).toBe(201);
    const resultBody = JSON.parse(result.body) as { amountMinor: string };
    expect(resultBody.amountMinor).toBe('9007199254740992');
    const denied = await app.inject({
      method: 'POST',
      url: '/internal/balances/debt',
      payload: { userId: ownerId, counterpartyId },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it('honors a trusted sync expense id, preserves operation idempotency, and serves the feed', async () => {
    const repository = new InMemoryExpenseRepository();
    const social: LedgerSocialAdapter = {
      isGroupMember: () => Promise.resolve(true),
      isGroupAdmin: () => Promise.resolve(true),
      isFriend: () => Promise.resolve(true),
    };
    const app = await buildLedgerServer('secret', {
      repository,
      social,
      serviceKey: 'service-secret',
    });
    const headers = {
      'x-equa-service-key': 'service-secret',
      'idempotency-key': 'op-create',
    };
    const payload = {
      ownerId,
      deviceId: 'device',
      action: 'create',
      expectedVersion: 0,
      amountMinor: '100',
      currency: 'USD',
      payerId: ownerId,
      participants: [{ userId: ownerId, shareMinor: '100' }],
    };
    const created = await app.inject({
      method: 'POST',
      url: `/internal/sync/expense/${expenseId}`,
      headers,
      payload,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ version: 1 });
    const duplicate = await app.inject({
      method: 'POST',
      url: `/internal/sync/expense/${expenseId}`,
      headers,
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ version: 1 });
    const conflictingId = await app.inject({
      method: 'POST',
      url: `/internal/sync/expense/${expenseId}`,
      headers: { ...headers, 'idempotency-key': 'op-create-2' },
      payload,
    });
    expect(conflictingId.statusCode).toBe(409);
    const feed = await app.inject({
      method: 'GET',
      url: `/internal/ledger/feed?ownerId=${ownerId}`,
      headers: { 'x-equa-service-key': 'service-secret' },
    });
    expect(feed.statusCode).toBe(200);
    const feedBody = JSON.parse(feed.body) as { events: unknown[] };
    expect(feedBody.events).toHaveLength(1);
    await app.close();
  });

  it('accepts only the configured caller key for each internal route', async () => {
    const app = await buildLedgerServer('secret', {
      repository: new InMemoryExpenseRepository(),
      social: {
        isGroupMember: () => Promise.resolve(true),
        isGroupAdmin: () => Promise.resolve(true),
        isFriend: () => Promise.resolve(true),
      },
      socialServiceKey: 'social-caller',
      automationServiceKey: 'automation-caller',
    });
    const socialRequest = await app.inject({
      method: 'POST',
      url: '/internal/balances/debt',
      headers: { 'x-equa-service-key': 'social-caller' },
      payload: { userId: ownerId, counterpartyId },
    });
    expect(socialRequest.statusCode).toBe(200);
    const wrongSocial = await app.inject({
      method: 'POST',
      url: '/internal/balances/debt',
      headers: { 'x-equa-service-key': 'automation-caller' },
      payload: { userId: ownerId, counterpartyId },
    });
    expect(wrongSocial.statusCode).toBe(403);
    const wrongAutomation = await app.inject({
      method: 'GET',
      url: `/internal/ledger/feed?ownerId=${ownerId}`,
      headers: { 'x-equa-service-key': 'social-caller' },
    });
    expect(wrongAutomation.statusCode).toBe(403);
    await app.close();
  });

  it('returns null currency for an empty pair and validates internal UUID fields', async () => {
    const app = await buildLedgerServer('secret', {
      repository: new InMemoryExpenseRepository('test-feed-secret'),
      social: {
        isGroupMember: () => Promise.resolve(true),
        isGroupAdmin: () => Promise.resolve(true),
        isFriend: () => Promise.resolve(true),
      },
      serviceKey: 'service-secret',
    });
    const emptyPair = await app.inject({
      method: 'POST',
      url: '/internal/balances/pair',
      headers: { 'x-equa-service-key': 'service-secret' },
      payload: { userId: ownerId, counterpartyId },
    });
    expect(emptyPair.statusCode).toBe(200);
    expect(emptyPair.json()).toMatchObject({ netMinor: '0', currency: null, balances: [] });

    const invalidInternalId = await app.inject({
      method: 'POST',
      url: '/internal/expenses',
      headers: { 'x-equa-service-key': 'service-secret', 'idempotency-key': 'invalid-id' },
      payload: {
        ownerId,
        payload: {
          id: 'not-a-uuid',
          amountMinor: '10',
          currency: 'USD',
          payerId: ownerId,
        },
      },
    });
    expect(invalidInternalId.statusCode).toBe(400);

    const invalidSyncPayer = await app.inject({
      method: 'POST',
      url: `/internal/sync/expense/${expenseId}`,
      headers: { 'x-equa-service-key': 'service-secret', 'idempotency-key': 'invalid-payer' },
      payload: {
        ownerId,
        action: 'create',
        payerId: 'not-a-uuid',
        amountMinor: '10',
        currency: 'USD',
      },
    });
    expect(invalidSyncPayer.statusCode).toBe(400);
    await app.close();
  });
});
