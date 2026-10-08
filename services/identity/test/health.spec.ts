import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';

import { HealthController } from '../src/health.controller';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('identity health', () => {
  it('identifies the service', () => {
    const reply = { header: vi.fn() };
    expect(
      new HealthController().health(undefined, reply as unknown as FastifyReply),
    ).toMatchObject({
      status: 'ok',
      service: 'identity',
    });
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('allows the configured Web origin to read only the health response', () => {
    vi.stubEnv('APP_WEB_URL', 'https://equa-staging-demo-web.vercel.app');
    const reply = { header: vi.fn() };

    new HealthController().health(
      'https://equa-staging-demo-web.vercel.app',
      reply as unknown as FastifyReply,
    );

    expect(reply.header).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://equa-staging-demo-web.vercel.app',
    );
    expect(reply.header).toHaveBeenCalledWith('Vary', 'Origin');
  });

  it('does not enable health CORS for other origins', () => {
    vi.stubEnv('APP_WEB_URL', 'https://equa-staging-demo-web.vercel.app');
    const reply = { header: vi.fn() };

    new HealthController().health('https://attacker.example', reply as unknown as FastifyReply);

    expect(reply.header).not.toHaveBeenCalled();
  });
});
