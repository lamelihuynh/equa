import { config as loadEnv } from 'dotenv';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';

import {
  HttpIdentityDirectory,
  UnavailableIdentityDirectory,
  type IdentityDirectory,
} from './identity-adapter.js';
import {
  FailClosedLedgerAdapter,
  HttpSocialLedgerAdapter,
  type SocialLedgerAdapter,
} from './ledger-adapter.js';
import { SocialError } from './errors.js';
import { SocialDatabase } from './database/postgres.repository.js';
import { InMemorySocialRepository, type SocialRepository } from './social.repository.js';
import { SocialService, type AuthenticatedSocialUser } from './social.service.js';
import type { GroupType } from './types.js';

loadEnv();

export interface SocialServerOptions {
  repository?: SocialRepository;
  identity?: IdentityDirectory;
  ledger?: SocialLedgerAdapter;
  serviceKey?: string;
  ledgerServiceKey?: string;
}

export async function buildServer(
  secret = process.env.IDENTITY_JWT_SECRET,
  options: SocialServerOptions = {},
): Promise<FastifyInstance> {
  if (!secret) throw new Error('IDENTITY_JWT_SECRET must be configured.');
  const repository = options.repository ?? createRepository();
  const identity = options.identity ?? createIdentityDirectory();
  const ledger = options.ledger ?? createLedgerAdapter();
  const service = new SocialService(repository, identity, ledger);
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
    service: 'social',
    timestamp: new Date().toISOString(),
  }));
  app.post('/internal/groups/member', async (request, reply) =>
    internal(reply, ledgerCallerKey(options), async () => {
      const body = record(request.body);
      if (typeof body?.groupId !== 'string' || typeof body.userId !== 'string')
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send({ member: await service.isMember(body.groupId, body.userId) });
    }),
  );
  app.post('/internal/groups/admin', async (request, reply) =>
    internal(reply, ledgerCallerKey(options), async () => {
      const body = record(request.body);
      if (typeof body?.groupId !== 'string' || typeof body.userId !== 'string')
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send({ admin: await service.isAdmin(body.groupId, body.userId) });
    }),
  );
  app.post('/internal/friends/check', async (request, reply) =>
    internal(reply, ledgerCallerKey(options), async () => {
      const body = record(request.body);
      if (typeof body?.userA !== 'string' || typeof body.userB !== 'string')
        return reply.code(400).send({ code: 'INVALID_REQUEST' });
      return reply.send({ friend: await service.isFriend(body.userA, body.userB) });
    }),
  );
  app.post('/v1/friends/requests', async (request, reply) =>
    wrap(reply, async () => {
      const body = record(request.body);
      const identifier = body?.identifier;
      if (typeof identifier !== 'string')
        throw new SocialError('INVALID_IDENTIFIER', 'Identifier is required.');
      return reply.code(201).send(await service.sendFriendRequest(user(request), identifier));
    }),
  );
  app.get('/v1/friends/requests', async (request, reply) =>
    wrap(reply, async () => reply.send(await service.listFriendRequests(user(request)))),
  );
  app.post('/v1/friends/requests/:id/accept', async (request, reply) =>
    wrap(reply, async () => {
      const result = await service.acceptFriendRequest(user(request), params(request).id);
      return reply.code(200).send(result);
    }),
  );
  app.post('/v1/friends/requests/:id/reject', async (request, reply) =>
    wrap(reply, async () => {
      await service.rejectFriendRequest(user(request), params(request).id);
      return reply.code(204).send();
    }),
  );
  app.delete('/v1/friends/:friendId', async (request, reply) =>
    wrap(reply, async () => {
      await service.removeFriend(user(request), params(request).friendId);
      return reply.code(204).send();
    }),
  );
  app.get('/v1/friends/:friendId/balance', async (request, reply) =>
    wrap(reply, async () =>
      reply.send(await service.friendBalance(user(request), params(request).friendId)),
    ),
  );
  app.get('/v1/friends', async (request, reply) =>
    wrap(reply, async () => reply.send(await service.listFriends(user(request)))),
  );

  app.post('/v1/groups', async (request, reply) =>
    wrap(reply, async () => {
      const body = record(request.body);
      if (!body || typeof body.name !== 'string' || !isGroupType(body.type))
        throw new SocialError('INVALID_GROUP', 'name and type are required.');
      return reply.code(201).send(
        await service.createGroup(user(request), {
          name: body.name,
          imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : null,
          type: body.type,
        }),
      );
    }),
  );
  app.patch('/v1/groups/:id', async (request, reply) =>
    wrap(reply, async () => {
      const body = record(request.body) ?? {};
      const input: { name?: string; imageUrl?: string | null; type?: GroupType } = {};
      if (body.name !== undefined) input.name = stringValue(body.name, 'name');
      if (body.imageUrl !== undefined)
        input.imageUrl = body.imageUrl === null ? null : stringValue(body.imageUrl, 'imageUrl');
      if (body.type !== undefined) input.type = groupTypeValue(body.type);
      return reply.send(await service.updateGroup(user(request), params(request).id, input));
    }),
  );
  app.delete('/v1/groups/:id', async (request, reply) =>
    wrap(reply, async () => {
      await service.dissolveGroup(user(request), params(request).id);
      return reply.code(204).send();
    }),
  );
  app.post('/v1/groups/:id/invitations', async (request, reply) =>
    wrap(reply, async () => {
      const body = record(request.body);
      if (!body || (body.kind !== 'email' && body.kind !== 'link'))
        throw new SocialError('INVALID_INVITATION', 'Invitation kind is invalid.');
      return reply.code(201).send(
        await service.inviteToGroup(user(request), params(request).id, {
          kind: body.kind,
          identifier: typeof body.identifier === 'string' ? body.identifier : undefined,
        }),
      );
    }),
  );
  app.post('/v1/groups/invitations/:id/accept', async (request, reply) =>
    wrap(reply, async () =>
      reply.send(await service.acceptGroupInvitation(user(request), params(request).id)),
    ),
  );
  app.post('/v1/groups/invitations/accept', async (request, reply) =>
    wrap(reply, async () => {
      const body = record(request.body);
      if (!body || typeof body.invitation !== 'string')
        throw new SocialError('INVALID_INVITATION', 'Invitation id or token is required.');
      return reply.send(await service.acceptGroupInvitation(user(request), body.invitation));
    }),
  );
  app.get('/v1/groups/:id/members', async (request, reply) =>
    wrap(reply, async () =>
      reply.send(await service.listGroupMembers(user(request), params(request).id)),
    ),
  );
  app.get('/v1/groups/:id', async (request, reply) =>
    wrap(reply, async () => reply.send(await service.getGroup(user(request), params(request).id))),
  );
  app.delete('/v1/groups/:id/members/:userId', async (request, reply) =>
    wrap(reply, async () => {
      await service.removeGroupMember(user(request), params(request).id, params(request).userId);
      return reply.code(204).send();
    }),
  );
  return app;
}

function ledgerCallerKey(options: SocialServerOptions): string | undefined {
  return options.ledgerServiceKey ?? options.serviceKey ?? process.env.LEDGER_SERVICE_KEY;
}

async function bootstrap(): Promise<void> {
  if (!process.env.IDENTITY_JWT_SECRET) return;
  const app = await buildServer();
  await app.listen({ port: Number(process.env.SOCIAL_PORT ?? 3005), host: '0.0.0.0' });
}
void bootstrap();

function createRepository(): SocialRepository {
  return process.env.SOCIAL_DATABASE_URL
    ? new SocialDatabase(process.env.SOCIAL_DATABASE_URL)
    : new InMemorySocialRepository();
}
function createIdentityDirectory(): IdentityDirectory {
  const serviceKey = process.env.IDENTITY_SERVICE_KEY ?? process.env.SOCIAL_SERVICE_KEY;
  return process.env.IDENTITY_URL && serviceKey
    ? new HttpIdentityDirectory(process.env.IDENTITY_URL, serviceKey)
    : new UnavailableIdentityDirectory();
}
function createLedgerAdapter(): SocialLedgerAdapter {
  return process.env.LEDGER_URL && process.env.SOCIAL_SERVICE_KEY
    ? new HttpSocialLedgerAdapter(process.env.LEDGER_URL, process.env.SOCIAL_SERVICE_KEY)
    : new FailClosedLedgerAdapter();
}
function user(request: FastifyRequest): AuthenticatedSocialUser {
  const current = request.user;
  if (!current) throw new SocialError('UNAUTHORIZED', 'Authentication is required.', 401);
  return current;
}
type RouteParams = { id: string; friendId: string; userId: string };
function params(request: FastifyRequest): RouteParams {
  return request.params as RouteParams;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw new SocialError('INVALID_INPUT', `${field} must be a string.`);
  return value;
}
function isGroupType(value: unknown): value is GroupType {
  return value === 'trip' || value === 'household' || value === 'event' || value === 'other';
}
function groupTypeValue(value: unknown): GroupType {
  if (!isGroupType(value)) throw new SocialError('INVALID_GROUP_TYPE', 'Group type is invalid.');
  return value;
}
async function wrap<T>(reply: FastifyReply, task: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof SocialError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    throw error;
  }
}
async function internal<T>(
  reply: FastifyReply,
  serviceKey: string | undefined,
  task: () => Promise<T>,
): Promise<T | FastifyReply> {
  const expected = serviceKey ?? process.env.SOCIAL_SERVICE_KEY;
  if (!expected || reply.request.headers['x-equa-service-key'] !== expected)
    return reply.code(403).send({ code: 'SERVICE_FORBIDDEN' });
  return task();
}
