import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseDomainEvent, type DomainEvent } from '@equa/contracts';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { HttpLedgerAdapter } from '../src/ledger/ledger.adapter.js';

// Vitest executes this test as ESM while NodeNext typecheck sees the package as CJS.
// @ts-expect-error TS1470 is specific to that CJS typecheck interpretation.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const secret = 'local-demo-jwt-secret';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const syncExpense = '00000000-0000-4000-8000-000000000004';

interface ServerModule {
  buildServer?: (secret: string, options: Record<string, unknown>) => Promise<FastifyInstance>;
  buildLedgerServer?: (
    secret: string,
    options: Record<string, unknown>,
  ) => Promise<FastifyInstance>;
}

interface ConstructorModule {
  InMemorySocialRepository?: new () => unknown;
  InMemoryExpenseRepository?: new (feedSecret?: string) => unknown;
  HttpSocialLedgerAdapter?: new (
    baseUrl: string,
    serviceKey: string,
    fetcher: typeof fetch,
  ) => unknown;
  HttpLedgerSocialAdapter?: new (
    baseUrl: string,
    serviceKey: string,
    fetcher: typeof fetch,
  ) => unknown;
  InMemoryNotificationStore?: new () => NotificationStoreLike;
  NotificationWorker?: new (
    store: NotificationStoreLike,
    provider: NotificationProviderLike,
  ) => NotificationWorkerLike;
}

interface NotificationStoreLike {
  persistInboxAndJob(event: DomainEvent, job: object): Promise<'inserted' | 'duplicate'>;
  count(): number;
}

interface NotificationProviderLike {
  enabled: boolean;
  deliver(): Promise<void>;
}

interface NotificationWorkerLike {
  ingest(event: DomainEvent, message: { ack(): void; nack(requeue: boolean): void }): Promise<void>;
}

async function jwt(id: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer('equa-identity')
    .setAudience('equa-clients')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));
}

function moduleUrl(...parts: string[]): string {
  return pathToFileURL(join(repoRoot, ...parts)).href;
}

function bridge(getApp: () => FastifyInstance): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    const requestInit = init ?? {};
    const headers = new Headers(requestInit.headers);
    const response = await getApp().inject({
      method: (requestInit.method ?? 'GET').toUpperCase() as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(headers.entries()),
      ...(typeof requestInit.body === 'string' ? { payload: requestInit.body } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': response.headers['content-type'] ?? 'application/json' },
    });
  };
}

describe('local in-memory vertical demo', () => {
  it('connects Identity JWT, Social, Ledger, sync/feed and notification ingest', async () => {
    const [
      socialServerModule,
      socialRepositoryModule,
      socialLedgerModule,
      ledgerServerModule,
      ledgerRepositoryModule,
      ledgerSocialModule,
      notificationModule,
      workerModule,
    ] = (await Promise.all([
      import(moduleUrl('services', 'social', 'src', 'main.ts')),
      import(moduleUrl('services', 'social', 'src', 'social.repository.ts')),
      import(moduleUrl('services', 'social', 'src', 'ledger-adapter.ts')),
      import(moduleUrl('services', 'ledger', 'src', 'main.server.ts')),
      import(moduleUrl('services', 'ledger', 'src', 'expense.repository.ts')),
      import(moduleUrl('services', 'ledger', 'src', 'social-adapter.ts')),
      import(moduleUrl('workers', 'notification', 'src', 'in-memory.store.ts')),
      import(moduleUrl('workers', 'notification', 'src', 'notification.worker.ts')),
    ])) as Array<unknown> as [
      ServerModule,
      ConstructorModule,
      ConstructorModule,
      ServerModule,
      ConstructorModule,
      ConstructorModule,
      ConstructorModule,
      ConstructorModule,
    ];
    const apps: { social?: FastifyInstance; ledger?: FastifyInstance } = {};
    const identity = {
      resolveIdentifier: (identifier: string) =>
        Promise.resolve(
          identifier === 'bob@example.test'
            ? { id: bob, email: 'bob@example.test' }
            : identifier === 'alice@example.test'
              ? { id: alice, email: 'alice@example.test' }
              : undefined,
        ),
    };
    const socialLedger = new socialLedgerModule.HttpSocialLedgerAdapter!(
      'http://ledger.local',
      'ledger-service-key',
      bridge(() => {
        if (!apps.ledger) throw new Error('Ledger app is not ready.');
        return apps.ledger;
      }),
    );
    const socialApp = await socialServerModule.buildServer!(secret, {
      repository: new socialRepositoryModule.InMemorySocialRepository!(),
      identity,
      ledger: socialLedger,
      serviceKey: 'social-service-key',
      ledgerServiceKey: 'social-service-key',
    });
    apps.social = socialApp;
    const ledgerSocial = new ledgerSocialModule.HttpLedgerSocialAdapter!(
      'http://social.local',
      'social-service-key',
      bridge(() => {
        if (!apps.social) throw new Error('Social app is not ready.');
        return apps.social;
      }),
    );
    const ledgerApp = await ledgerServerModule.buildLedgerServer!(secret, {
      repository: new ledgerRepositoryModule.InMemoryExpenseRepository!('local-demo-feed-secret'),
      social: ledgerSocial,
      automationServiceKey: 'ledger-service-key',
      socialServiceKey: 'ledger-service-key',
    });
    apps.ledger = ledgerApp;

    try {
      const aliceAuth = { authorization: `Bearer ${await jwt(alice, 'alice@example.test')}` };
      const bobAuth = { authorization: `Bearer ${await jwt(bob, 'bob@example.test')}` };
      const request = await socialApp.inject({
        method: 'POST',
        url: '/v1/friends/requests',
        headers: aliceAuth,
        payload: { identifier: 'bob@example.test' },
      });
      expect(request.statusCode).toBe(201);
      const accepted = await socialApp.inject({
        method: 'POST',
        url: `/v1/friends/requests/${request.json<{ id: string }>().id}/accept`,
        headers: bobAuth,
      });
      expect(accepted.statusCode).toBe(200);

      const created = await ledgerApp.inject({
        method: 'POST',
        url: '/v1/expenses',
        headers: { ...aliceAuth, 'idempotency-key': 'local-public-expense' },
        payload: {
          amountMinor: '100',
          currency: 'USD',
          payerId: alice,
          participants: [{ userId: bob, shareMinor: '100' }],
          friendId: bob,
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json<{ id: string }>().id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const adapter = new HttpLedgerAdapter(
        'http://ledger.local',
        'ledger-service-key',
        bridge(() => ledgerApp),
      );
      await expect(
        adapter.createRecurringOccurrence({
          idempotencyKey: 'local-recurring-expense',
          ownerId: alice,
          payload: { amountMinor: '25', currency: 'USD', payerId: alice },
        }),
      ).resolves.toBeUndefined();
      await expect(
        adapter.applySync(alice, 'local-device', {
          id: '00000000-0000-4000-8000-000000000005',
          entity: 'expense',
          entityId: syncExpense,
          expectedVersion: 0,
          payload: {
            action: 'create',
            amountMinor: '30',
            currency: 'USD',
            payerId: alice,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      ).resolves.toEqual({ version: 1 });

      const feed = await adapter.readFeed(alice);
      expect(feed.events).toHaveLength(3);
      const events = feed.events
        .map((value) => parseDomainEvent(value))
        .filter((event): event is DomainEvent => event !== undefined);
      expect(events).toHaveLength(3);
      expect(events.map((event) => event.type)).toEqual([
        'expense.created',
        'expense.created',
        'expense.created',
      ]);

      const store = new notificationModule.InMemoryNotificationStore!();
      const worker = new workerModule.NotificationWorker!(store, {
        enabled: false,
        deliver: () => Promise.resolve(),
      });
      let acknowledgements = 0;
      for (const event of events) {
        await worker.ingest(event, {
          ack: () => {
            acknowledgements += 1;
          },
          nack: () => undefined,
        });
      }
      expect(acknowledgements).toBe(3);
      expect(store.count()).toBe(3);
    } finally {
      await ledgerApp.close();
      await socialApp.close();
    }
  });
});
