import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';

import { LedgerDatabase } from './database/postgres.repository.js';
import { InMemoryExpenseRepository, type ExpenseRepository } from './expense.repository.js';
import { LedgerError } from './errors.js';
import {
  ExpenseService,
  type AuthenticatedLedgerUser,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from './expense.service.js';
import {
  FailClosedSocialAdapter,
  HttpLedgerSocialAdapter,
  type LedgerSocialAdapter,
} from './social-adapter.js';

export interface LedgerServerOptions {
  repository?: ExpenseRepository;
  social?: LedgerSocialAdapter;
  serviceKey?: string;
  automationServiceKey?: string;
  socialServiceKey?: string;
}

export async function buildLedgerServer(
  secret = process.env.IDENTITY_JWT_SECRET,
  options: LedgerServerOptions = {},
): Promise<FastifyInstance> {
  if (!secret) throw new Error('IDENTITY_JWT_SECRET must be configured.');
  const repository =
    options.repository ??
    (process.env.LEDGER_DATABASE_URL
      ? new LedgerDatabase(process.env.LEDGER_DATABASE_URL)
      : new InMemoryExpenseRepository());
  const social =
    options.social ??
    (process.env.SOCIAL_URL && process.env.LEDGER_SERVICE_KEY
      ? new HttpLedgerSocialAdapter(process.env.SOCIAL_URL, process.env.LEDGER_SERVICE_KEY)
      : new FailClosedSocialAdapter());
  const service = new ExpenseService(repository, social);
  const app = Fastify();
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/internal/')) return;
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      await reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Missing bearer token.' });
      return;
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: process.env.IDENTITY_JWT_ISSUER ?? 'equa-identity',
        audience: process.env.IDENTITY_JWT_AUDIENCE ?? 'equa-clients',
      });
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('invalid claims');
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      await reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid access token.' });
    }
  });
  app.get('/health', () => ({
    status: 'ok',
    service: 'ledger',
    timestamp: new Date().toISOString(),
  }));
  app.post('/v1/expenses', async (request, reply) =>
    handle(reply, async () => {
      const body = record(request.body);
      if (!body || body.id !== undefined)
        throw new LedgerError('INVALID_INPUT', 'Public expense creation cannot specify an id.');
      return reply
        .code(201)
        .send(
          await service.create(
            ledgerUser(request),
            body as unknown as CreateExpenseInput,
            header(request, 'idempotency-key'),
          ),
        );
    }),
  );
  app.get('/v1/expenses/total', async (request, reply) =>
    handle(reply, async () =>
      reply.send(await service.total(ledgerUser(request), filters(request.query))),
    ),
  );
  app.get('/v1/expenses/:id', async (request, reply) =>
    handle(reply, async () =>
      reply.send(await service.get(ledgerUser(request), params(request).id)),
    ),
  );
  app.get('/v1/expenses/:id/history', async (request, reply) =>
    handle(reply, async () =>
      reply.send(await service.history(ledgerUser(request), params(request).id)),
    ),
  );
  app.patch('/v1/expenses/:id', async (request, reply) =>
    handle(reply, async () =>
      reply.send(
        await service.update(
          ledgerUser(request),
          params(request).id,
          request.body as UpdateExpenseInput,
          header(request, 'idempotency-key'),
        ),
      ),
    ),
  );
  app.delete('/v1/expenses/:id', async (request, reply) =>
    handle(reply, async () =>
      reply.send(
        await service.remove(
          ledgerUser(request),
          params(request).id,
          header(request, 'idempotency-key'),
          optionalExpectedVersion(request.body),
        ),
      ),
    ),
  );
  app.post('/v1/categories', async (request, reply) =>
    handle(reply, async () => {
      const body = request.body as { name?: unknown };
      if (typeof body?.name !== 'string')
        throw new LedgerError('INVALID_CATEGORY', 'Category name is required.');
      return reply.code(201).send(await service.createCategory(ledgerUser(request), body.name));
    }),
  );
  app.get('/v1/categories', async (request, reply) =>
    handle(reply, async () => reply.send(await service.categories(ledgerUser(request)))),
  );
  app.post('/internal/expenses', async (request, reply) =>
    internal(reply, automationServiceKey(options), async () => {
      const body = record(request.body);
      const ownerId = body?.ownerId;
      const payload = record(body?.payload);
      const key = request.headers['idempotency-key'];
      if (
        typeof ownerId !== 'string' ||
        !isUuid(ownerId) ||
        !payload ||
        !validInternalExpenseIds(payload) ||
        typeof key !== 'string'
      )
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const input = {
        ...payload,
        id: typeof payload.id === 'string' ? payload.id : undefined,
        expectedVersion: 0,
        payerId: typeof payload.payerId === 'string' ? payload.payerId : ownerId,
      } as CreateExpenseInput;
      return reply.send(await service.create({ id: ownerId, email: '' }, input, key));
    }),
  );
  app.post('/internal/sync/expense/:id', async (request, reply) =>
    internal(reply, automationServiceKey(options), async () => {
      const body = record(request.body);
      if (
        !body ||
        typeof body.ownerId !== 'string' ||
        !isUuid(body.ownerId) ||
        typeof body.action !== 'string' ||
        !validInternalExpenseIds(body)
      )
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const owner = { id: body.ownerId, email: '' };
      const id = (request.params as { id: string }).id;
      if (!isUuid(id)) return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string') return reply.code(400).send({ code: 'IDEMPOTENCY_REQUIRED' });
      if (body.action === 'create') {
        const created = await service.create(
          owner,
          {
            ...body,
            id,
            expectedVersion: body.expectedVersion ?? 0,
            payerId: typeof body.payerId === 'string' ? body.payerId : body.ownerId,
          } as CreateExpenseInput,
          key,
        );
        return reply.send({ version: created.version });
      }
      if (body.action === 'update') {
        const updated = await service.update(owner, id, body, key);
        return reply.send({ version: updated.version });
      }
      if (body.action === 'delete') {
        const deleted = await service.remove(owner, id, key, optionalExpectedVersion(body));
        return reply.send({ version: deleted.version });
      }
      return reply.code(400).send({ code: 'UNSUPPORTED_SYNC_OPERATION' });
    }),
  );
  app.get('/internal/ledger/feed', async (request, reply) =>
    internal(reply, automationServiceKey(options), async () => {
      const query = request.query as { ownerId?: unknown; cursor?: unknown; limit?: unknown };
      if (typeof query.ownerId !== 'string' || !isUuid(query.ownerId))
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        return reply.code(400).send({ code: 'INVALID_LIMIT' });
      return reply.send(
        await service.feed(
          query.ownerId,
          typeof query.cursor === 'string' ? query.cursor : undefined,
          limit,
        ),
      );
    }),
  );
  app.post('/internal/balances/pair', async (request, reply) =>
    internal(reply, socialServiceKey(options), async () => {
      const body = request.body as { userId?: unknown; counterpartyId?: unknown };
      if (
        typeof body?.userId !== 'string' ||
        typeof body.counterpartyId !== 'string' ||
        !isUuid(body.userId) ||
        !isUuid(body.counterpartyId)
      )
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send(await service.pairBalance(body.userId, body.counterpartyId));
    }),
  );
  app.post('/internal/balances/debt', async (request, reply) =>
    internal(reply, socialServiceKey(options), async () => {
      const body = request.body as { userId?: unknown; counterpartyId?: unknown };
      if (
        typeof body?.userId !== 'string' ||
        typeof body.counterpartyId !== 'string' ||
        !isUuid(body.userId) ||
        !isUuid(body.counterpartyId)
      )
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send({
        hasOutstandingDebt: await service.hasOutstandingDebt(body.userId, body.counterpartyId),
      });
    }),
  );
  app.post('/internal/balances/group-debt', async (request, reply) =>
    internal(reply, socialServiceKey(options), async () => {
      const body = request.body as { groupId?: unknown; userId?: unknown };
      if (
        typeof body?.groupId !== 'string' ||
        typeof body.userId !== 'string' ||
        !isUuid(body.groupId) ||
        !isUuid(body.userId)
      )
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send({
        hasOutstandingDebt: await service.hasOutstandingGroupDebt(body.groupId, body.userId),
      });
    }),
  );
  return app;
}

function automationServiceKey(options: LedgerServerOptions): string | undefined {
  return (
    options.automationServiceKey ??
    options.serviceKey ??
    process.env.AUTOMATION_SYNC_SERVICE_KEY ??
    process.env.LEDGER_SERVICE_KEY
  );
}
function socialServiceKey(options: LedgerServerOptions): string | undefined {
  return (
    options.socialServiceKey ??
    options.serviceKey ??
    process.env.SOCIAL_SERVICE_KEY ??
    process.env.LEDGER_SERVICE_KEY
  );
}

function ledgerUser(request: FastifyRequest): AuthenticatedLedgerUser {
  const current = request.user;
  if (!current) throw new LedgerError('UNAUTHORIZED', 'Authentication is required.', 401);
  return current;
}
function params(request: FastifyRequest): { id: string } {
  return request.params as { id: string };
}
function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  if (typeof value !== 'string' || !value.trim())
    throw new LedgerError('IDEMPOTENCY_REQUIRED', 'Idempotency-Key is required.', 400);
  return value;
}
function filters(value: unknown): {
  userId?: string;
  friendId?: string;
  groupId?: string;
  tripId?: string;
  from?: string;
  to?: string;
} {
  const query = value as Record<string, unknown>;
  return {
    userId: stringFilter(query.userId),
    friendId: stringFilter(query.friendId),
    groupId: stringFilter(query.groupId),
    tripId: stringFilter(query.tripId),
    from: stringFilter(query.from),
    to: stringFilter(query.to),
  };
}
function stringFilter(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validInternalExpenseIds(value: Record<string, unknown>): boolean {
  for (const field of ['id', 'payerId', 'friendId', 'groupId', 'tripId'] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (typeof candidate !== 'string' || !isUuid(candidate)))
      return false;
  }
  const participants = value.participants;
  if (participants === undefined || !Array.isArray(participants)) return true;
  return participants.every(
    (participant) =>
      typeof participant === 'object' &&
      participant !== null &&
      !Array.isArray(participant) &&
      typeof (participant as Record<string, unknown>).userId === 'string' &&
      isUuid((participant as Record<string, unknown>).userId as string),
  );
}
function optionalExpectedVersion(value: unknown): number | undefined {
  const body = record(value);
  return body?.expectedVersion as number | undefined;
}
async function handle<T>(reply: FastifyReply, task: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof LedgerError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    throw error;
  }
}
async function internal<T>(
  reply: FastifyReply,
  serviceKey: string | undefined,
  task: () => Promise<T>,
): Promise<T | FastifyReply> {
  if (!serviceKey || reply.request.headers['x-equa-service-key'] !== serviceKey)
    return reply.code(403).send({ code: 'SERVICE_FORBIDDEN' });
  try {
    return await task();
  } catch (error) {
    if (error instanceof LedgerError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    throw error;
  }
}
