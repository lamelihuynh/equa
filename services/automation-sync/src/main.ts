import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { jwtVerify } from 'jose';

import { parseSyncConflictResolution, parseSyncRequest } from '@equa/contracts';

import { AutomationService } from './automation/automation.service.js';
import { PostgresScheduler } from './automation/postgres.scheduler.js';
import {
  nextRecurringOccurrence,
  parseRecurringSchedule,
  parseRecurringStart,
} from './automation/recurrence.js';
import { AutomationDatabase } from './database/postgres.repository.js';
import {
  DisabledLedgerAdapter,
  HttpLedgerAdapter,
  LedgerUnavailableError,
  type LedgerAdapter,
} from './ledger/ledger.adapter.js';
import { SyncService } from './sync/sync.service.js';

if (process.env.NODE_ENV !== 'test')
  loadEnv({ path: join(process.cwd(), '../../.env'), quiet: true });

const ledger: LedgerAdapter = createLedgerAdapter();
const databaseUrl = process.env.AUTOMATION_SYNC_DATABASE_URL;
const database = databaseUrl ? new AutomationDatabase(databaseUrl) : undefined;
const scheduler = database ? new PostgresScheduler(database, ledger) : undefined;
const service = scheduler ? undefined : new AutomationService(ledger);
const sync = database ? new SyncService(ledger, database) : undefined;
console.info(
  JSON.stringify({
    level: 'info',
    service: 'automation-sync',
    message: scheduler
      ? 'PostgreSQL scheduler ready; Ledger adapter configured'
      : 'persistence not configured; scheduler disabled',
  }),
);
const tick = setInterval(() => {
  if (scheduler)
    void scheduler
      .tick()
      .catch((error: unknown) => reportRecoverableError('scheduler tick', error));
  else if (service)
    void service
      .tick()
      .catch((error: unknown) => reportRecoverableError('in-memory scheduler tick', error));
}, 30_000);
tick.unref();

export async function buildServer(
  secret = process.env.IDENTITY_JWT_SECRET,
  db: AutomationDatabase | undefined = database,
  syncService: SyncService | undefined = sync,
  ledgerAdapter: LedgerAdapter = ledger,
  options: { rateLimitMax?: number } = {},
): Promise<FastifyInstance> {
  if (!secret) throw new Error('IDENTITY_JWT_SECRET must be configured.');
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
      base: { service: 'automation-sync' },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-equa-service-key"]',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (request) => ({
          method: request.method,
          route: request.routeOptions.url ?? request.url.split('?')[0],
        }),
      },
    },
    genReqId: correlationIdFor,
    requestIdLogLabel: 'correlationId',
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-correlation-id', request.id);
    return payload;
  });
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url === '/ready') return;
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return reply.code(401).send({ message: 'Missing bearer token.' });
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: process.env.IDENTITY_JWT_ISSUER ?? 'equa-identity',
        audience: process.env.IDENTITY_JWT_AUDIENCE ?? 'equa-clients',
      });
      if (!payload.sub) return reply.code(401).send({ message: 'Invalid access token.' });
      request.headers['x-equa-owner'] = payload.sub;
    } catch {
      return reply.code(401).send({ message: 'Invalid access token.' });
    }
  });
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 120,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (request) => {
      const owner = request.headers['x-equa-owner'];
      return typeof owner === 'string' ? `owner:${owner}` : `ip:${request.ip}`;
    },
  });

  app.get('/health', { config: { rateLimit: false } }, () => ({
    status: 'ok',
    service: 'automation-sync',
    timestamp: new Date().toISOString(),
  }));
  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    let databaseReady = false;
    if (db) {
      try {
        await db.ping();
        databaseReady = true;
      } catch {
        databaseReady = false;
      }
    }
    const checks = {
      database: databaseReady,
      ledger: ledgerAdapter.availability === 'available',
      sync: Boolean(syncService),
    };
    const ready = checks.database && checks.ledger && checks.sync;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'not_ready',
      service: 'automation-sync',
      checks,
    });
  });

  app.post('/v1/sync', async (request, reply) => {
    if (!syncService) return unavailable(reply, 'SYNC_PERSISTENCE_UNAVAILABLE');
    const input = parseSyncRequest(request.body);
    if (!input) return reply.code(400).send({ code: 'INVALID_SYNC_REQUEST' });
    try {
      return await syncService.push(ownerOf(request), input);
    } catch (error) {
      if (error instanceof LedgerUnavailableError) return unavailable(reply, 'LEDGER_UNAVAILABLE');
      throw error;
    }
  });
  app.post('/v1/sync/conflicts/:operationId/resolve', async (request, reply) => {
    if (!syncService) return unavailable(reply, 'SYNC_PERSISTENCE_UNAVAILABLE');
    const resolution = parseSyncConflictResolution(request.body);
    const pathId = (request.params as { operationId?: unknown }).operationId;
    if (!resolution || resolution.operationId !== pathId)
      return reply.code(400).send({ code: 'INVALID_CONFLICT_RESOLUTION' });
    const resolved = await syncService.resolveConflict(ownerOf(request), resolution);
    return resolved
      ? reply.send({ operationId: resolution.operationId, state: 'discarded' })
      : reply.code(409).send({ code: 'SYNC_CONFLICT_NOT_FOUND' });
  });
  app.get('/v1/sync/feed', async (request, reply) => {
    if (!syncService) return unavailable(reply, 'SYNC_PERSISTENCE_UNAVAILABLE');
    const cursor =
      typeof (request.query as { cursor?: unknown }).cursor === 'string'
        ? (request.query as { cursor: string }).cursor
        : undefined;
    try {
      return await syncService.feed(ownerOf(request), cursor);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Ledger integration is unavailable'))
        return unavailable(reply, 'LEDGER_UNAVAILABLE');
      throw error;
    }
  });
  app.post('/v1/recurring', async (request, reply) => {
    if (!db) return unavailable(reply, 'RECURRING_PERSISTENCE_UNAVAILABLE');
    const input = recurringInput(request.body, true);
    if (!input) return reply.code(400).send({ code: 'INVALID_RECURRING_RULE' });
    try {
      const rule = await db.createRule(ownerOf(request), input);
      return reply.code(201).send(rule);
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ code: 'RECURRING_RULE_EXISTS' });
      throw error;
    }
  });
  app.get('/v1/recurring/:id', async (request, reply) => {
    if (!db) return unavailable(reply, 'RECURRING_PERSISTENCE_UNAVAILABLE');
    const rule = await db.readRule(ownerOf(request), (request.params as { id: string }).id);
    return rule ?? reply.code(404).send({ code: 'RECURRING_RULE_NOT_FOUND' });
  });
  app.patch('/v1/recurring/:id', async (request, reply) => {
    if (!db) return unavailable(reply, 'RECURRING_PERSISTENCE_UNAVAILABLE');
    const body = recurringInput(request.body, false);
    const revision =
      isRecord(request.body) && typeof request.body.revision === 'number'
        ? request.body.revision
        : undefined;
    if (!body || revision === undefined)
      return reply.code(400).send({ code: 'INVALID_RECURRING_RULE' });
    const rule = await db.updateRule(
      ownerOf(request),
      (request.params as { id: string }).id,
      body,
      revision,
    );
    return rule ?? reply.code(409).send({ code: 'RECURRING_RULE_REVISION_CONFLICT' });
  });
  app.delete('/v1/recurring/:id', async (request, reply) => {
    if (!db) return unavailable(reply, 'RECURRING_PERSISTENCE_UNAVAILABLE');
    const disabled = await db.disableRule(ownerOf(request), (request.params as { id: string }).id);
    return disabled
      ? reply.code(204).send()
      : reply.code(404).send({ code: 'RECURRING_RULE_NOT_FOUND' });
  });
  return app;
}

async function bootstrap(): Promise<void> {
  if (!process.env.IDENTITY_JWT_SECRET) return;
  const app = await buildServer();
  await app.listen({ port: Number(process.env.AUTOMATION_SYNC_PORT ?? 3004), host: '0.0.0.0' });
}
void bootstrap().catch((error: unknown) => {
  reportRecoverableError('server startup', error);
  process.exitCode = 1;
});
process.on('SIGTERM', () => clearInterval(tick));

function reportRecoverableError(component: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'automation-sync',
      message: 'Background operation failed; it will be retried.',
      component,
      errorType: error instanceof Error ? error.name : typeof error,
    }),
  );
}

function ownerOf(request: FastifyRequest): string {
  const owner = request.headers['x-equa-owner'];
  if (typeof owner !== 'string') throw new Error('Authenticated owner is missing.');
  return owner;
}

function correlationIdFor(request: IncomingMessage): string {
  const candidate = request.headers['x-correlation-id'];
  return typeof candidate === 'string' && isUuid(candidate) ? candidate : randomUUID();
}

function unavailable(
  reply: { code(status: number): { send(body: object): unknown } },
  code: string,
): unknown {
  return reply.code(503).send({ code, message: 'The required external adapter is unavailable.' });
}

function recurringInput(
  value: unknown,
  requireId: boolean,
):
  { id: string; schedule: string; startsAt: string; payload: Record<string, unknown> } | undefined {
  if (
    !isRecord(value) ||
    typeof value.schedule !== 'string' ||
    typeof value.startsAt !== 'string' ||
    !isRecord(value.payload)
  )
    return undefined;
  const start = parseRecurringStart(value.startsAt);
  const schedule = parseRecurringSchedule(value.schedule);
  if (!start || !schedule) return undefined;
  try {
    nextRecurringOccurrence(start, start, schedule);
  } catch {
    return undefined;
  }
  if (requireId && (typeof value.id !== 'string' || !isUuid(value.id))) return undefined;
  return {
    id: requireId ? (value.id as string) : '',
    schedule: value.schedule,
    startsAt: start.toISOString(),
    payload: value.payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function createLedgerAdapter(): LedgerAdapter {
  return process.env.LEDGER_URL && process.env.AUTOMATION_SYNC_SERVICE_KEY
    ? new HttpLedgerAdapter(process.env.LEDGER_URL, process.env.AUTOMATION_SYNC_SERVICE_KEY)
    : new DisabledLedgerAdapter();
}
