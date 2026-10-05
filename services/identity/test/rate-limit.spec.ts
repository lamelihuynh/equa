import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { describe, expect, it } from 'vitest';

import { IDENTITY_RATE_LIMIT_OPTIONS } from '../src/security/rate-limit';

describe('Identity public API rate limit', () => {
  it('limits direct API traffic before route handlers run', async () => {
    const server = Fastify({ logger: false });
    await server.register(rateLimit, { ...IDENTITY_RATE_LIMIT_OPTIONS, max: 1 });
    let handlerCalls = 0;
    server.post('/v1/auth/login', () => {
      handlerCalls += 1;
      return { ok: true };
    });

    try {
      const first = await server.inject({ method: 'POST', url: '/v1/auth/login' });
      const second = await server.inject({ method: 'POST', url: '/v1/auth/login' });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(handlerCalls).toBe(1);
    } finally {
      await server.close();
    }
  });
});
