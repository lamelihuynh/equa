import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, maxDuration } from './route.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('same-origin readiness route', () => {
  it('fits the existing Vercel Hobby function-duration cap', () => {
    expect(maxDuration).toBe(60);
  });

  it('probes the configured Identity health URL and returns a normalized result', async () => {
    vi.stubEnv('EQUA_IDENTITY_HEALTH_URL', 'https://identity.example.test/health');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'ok', service: 'identity' }));
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(
      new Request('https://web.example.test/api/readiness?service=identity'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'identity' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(fetcher).toHaveBeenCalledWith(
      'https://identity.example.test/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it.each([
    ['social', 'EQUA_SOCIAL_HEALTH_URL', 'https://social.example.test/health'],
    ['ledger', 'EQUA_LEDGER_HEALTH_URL', 'https://ledger.example.test/health'],
  ] as const)('probes the configured %s health URL', async (service, envName, healthUrl) => {
    vi.stubEnv(envName, healthUrl);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'ok', service }));
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(
      new Request(`https://web.example.test/api/readiness?service=${service}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(fetcher).toHaveBeenCalledWith(
      healthUrl,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('probes Gateway /health without exposing upstream HTML or errors', async () => {
    vi.stubEnv('EQUA_GATEWAY_URL', 'https://gateway.example.test');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>starting</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(
      new Request('https://web.example.test/api/readiness?service=gateway'),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'starting', service: 'gateway' });
    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example.test/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('normalizes a ready Gateway health response', async () => {
    vi.stubEnv('EQUA_GATEWAY_URL', 'https://gateway.example.test');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: 'ok', service: 'identity' }));
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(
      new Request('https://web.example.test/api/readiness?service=gateway'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'gateway' });
    expect(fetcher).toHaveBeenCalledWith(
      'https://gateway.example.test/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('reports network failure as retryable JSON and logs only safe probe metadata', async () => {
    vi.stubEnv('EQUA_IDENTITY_HEALTH_URL', 'https://identity.example.test/health');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('socket detail')));
    const logger = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await GET(
      new Request('https://web.example.test/api/readiness?service=identity'),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'starting', service: 'identity' });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('"outcome":"network_error"'));
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining('socket detail'));
  });

  it('rejects arbitrary service targets without making an upstream request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    const response = await GET(
      new Request('https://web.example.test/api/readiness?service=https://attacker.example'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: 'error',
      code: 'INVALID_READINESS_SERVICE',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
