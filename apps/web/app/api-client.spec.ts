import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiBaseUrl,
  authJson,
  apiJson,
  ApiClientError,
  getMutationIdempotencyKey,
  LOCAL_DEMO_TOKEN,
  logoutSession,
  SessionExpiredError,
} from './api-client.js';

function stubBrowser(token = 'old-token'): Map<string, string> {
  const values = new Map<string, string>([['equa_access_token', token]]);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Equa web API client', () => {
  it('wakes Render directly using the public Gateway health URL when configured', async () => {
    const healthUrl = 'https://equa-staging-demo-gateway.onrender.com/health';
    vi.stubEnv('NEXT_PUBLIC_GATEWAY_HEALTH_URL', healthUrl);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"status":"ok","service":"identity"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"accessToken":"fresh-token"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    await expect(
      authJson('auth/login', { email: 'test@example.com', password: 'password' }),
    ).resolves.toEqual({
      accessToken: 'fresh-token',
    });

    const [healthUrlSent, healthInit] = fetcher.mock.calls[0] ?? [];
    expect(healthUrlSent).toBe(healthUrl);
    expect(healthInit?.method).toBe('GET');
    expect(healthInit?.cache).toBe('no-store');
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('wakes Identity directly before Gateway and sends only one auth mutation', async () => {
    vi.useFakeTimers();
    const identityUrl = 'https://equa-staging-demo-identity.onrender.com/health';
    const gatewayUrl = 'https://equa-staging-demo-gateway.onrender.com/health';
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_HEALTH_URL', identityUrl);
    vi.stubEnv('NEXT_PUBLIC_GATEWAY_HEALTH_URL', gatewayUrl);
    const healthResponse = () =>
      new Response('{"status":"ok","service":"identity"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<html>starting</html>', { status: 502 }))
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce(
        new Response('{"accepted":true}', {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    const request = authJson('auth/forgot-password', { email: 'test@example.com' });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(request).resolves.toEqual({ accepted: true });

    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [identityUrl, 'GET'],
      [identityUrl, 'GET'],
      [gatewayUrl, 'GET'],
      [`${apiBaseUrl}/auth/forgot-password`, 'POST'],
    ]);
  });

  it('wakes Identity through the Gateway before sending one auth POST', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"status":"ok","service":"identity"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"accessToken":"fresh-token"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    await expect(
      authJson('auth/login', { email: 'test@example.com', password: 'password' }),
    ).resolves.toEqual({
      accessToken: 'fresh-token',
    });

    const [readyUrl, readyInit] = fetcher.mock.calls[0] ?? [];
    expect(requestUrl(readyUrl!)).toContain(apiBaseUrl === '/v1' ? '/v1/auth/_ready' : '/health');
    expect(readyInit?.method).toBe('GET');
    expect(readyInit?.cache).toBe('no-store');

    const [loginUrl, loginInit] = fetcher.mock.calls[1] ?? [];
    expect(requestUrl(loginUrl!)).toContain('/auth/login');
    expect(loginInit?.method).toBe('POST');
    expect(loginInit?.credentials).toBe('include');
    expect(new Headers(loginInit?.headers).get('Content-Type')).toBe('application/json');
    expect(typeof loginInit?.body).toBe('string');
    if (typeof loginInit?.body === 'string')
      expect(JSON.parse(loginInit.body)).toEqual({
        email: 'test@example.com',
        password: 'password',
      });
  });

  it('retries only the safe readiness GET, then sends one auth POST', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<html>starting</html>', { status: 502 }))
      .mockResolvedValueOnce(
        new Response('{"status":"ok","service":"identity"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"accepted":true}', {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    const request = authJson('auth/forgot-password', { email: 'test@example.com' });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(request).resolves.toEqual({ accepted: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('POST');
  });

  it('shows an HTTP error for non-JSON Gateway responses without replaying the auth POST', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"status":"ok","service":"identity"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<!DOCTYPE html><html>Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    let caught: unknown;
    try {
      await authJson('auth/reset-password', { token: 'opaque', password: 'new-password' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiClientError);
    if (caught instanceof ApiClientError) {
      expect(caught.status).toBe(502);
      expect(caught.message).toContain('HTTP 502');
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('does not retry an expired verification token after the readiness probe succeeds', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"status":"ok","service":"identity"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"code":"AUTH_TOKEN_EXPIRED","message":"Token is invalid or expired."}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);

    let caught: unknown;
    try {
      await authJson('auth/verify-email', { token: 'synthetic-expired-token' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiClientError);
    if (caught instanceof ApiClientError) {
      expect(caught.status).toBe(400);
      expect(caught.code).toBe('AUTH_TOKEN_EXPIRED');
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent readiness failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{"message":"Forbidden"}', {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    await expect(
      authJson('auth/login', { email: 'test@example.com', password: 'password' }),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sends the access token and includes Identity refresh cookies', async () => {
    stubBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('[{"id":"group-id"}]', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(apiJson('groups')).resolves.toEqual([{ id: 'group-id' }]);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toContain('/groups');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer old-token');
    expect(init?.credentials).toBe('include');
  });

  it('refreshes a web session once and retries the failed request', async () => {
    const storage = stubBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"accessToken":"fresh-token"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{"groups":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(apiJson('groups')).resolves.toEqual({ groups: [] });
    expect(storage.get('equa_access_token')).toBe('fresh-token');
    const refreshCall = fetcher.mock.calls[1];
    expect(refreshCall?.[0]).toContain('/auth/refresh');
    expect(refreshCall?.[1]?.credentials).toBe('include');
    const retriedCall = fetcher.mock.calls[2];
    expect(new Headers(retriedCall?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('clears the expired session when the refresh cookie is rejected', async () => {
    const storage = stubBrowser();
    const browserWindow = globalThis.window;
    let expired = false;
    browserWindow.addEventListener('equa-session-expired', () => {
      expired = true;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );

    await expect(apiJson('groups')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(storage.has('equa_access_token')).toBe(false);
    expect(storage.get('equa_session_expired')).toBe('1');
    expect(expired).toBe(true);
  });

  it('does not restore an old account token after a switch while refresh is pending', async () => {
    const storage = stubBrowser('old-account-token');
    let releaseRefresh: (response: Response) => void = () => undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        requestUrl(input).endsWith('/auth/refresh')
          ? pendingRefresh
          : Promise.resolve(new Response(null, { status: 401 })),
      );
    vi.stubGlobal('fetch', fetcher);

    const request = apiJson('groups');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    storage.set('equa_access_token', 'new-account-token');
    releaseRefresh(new Response('{"accessToken":"stale-refreshed-token"}', { status: 200 }));

    await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(storage.get('equa_access_token')).toBe('new-account-token');
  });

  it('does not restore a token after logout while refresh is pending', async () => {
    const storage = stubBrowser('logged-out-token');
    let releaseRefresh: (response: Response) => void = () => undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        requestUrl(input).endsWith('/auth/refresh')
          ? pendingRefresh
          : Promise.resolve(new Response(null, { status: 401 })),
      );
    vi.stubGlobal('fetch', fetcher);

    const request = apiJson('groups');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    storage.delete('equa_access_token');
    releaseRefresh(new Response('{"accessToken":"stale-refreshed-token"}', { status: 200 }));

    await expect(request).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(storage.has('equa_access_token')).toBe(false);
  });

  it('preserves API status and code for visible validation errors', async () => {
    stubBrowser();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"code":"GROUP_FORBIDDEN","message":"Membership required."}', {
          status: 403,
        }),
      ),
    );

    await expect(apiJson('groups')).rejects.toMatchObject({
      status: 403,
      code: 'GROUP_FORBIDDEN',
      message: 'Membership required.',
    } satisfies Partial<ApiClientError>);
  });

  it('preserves Ledger idempotency keys and integer minor-unit mutation bodies', async () => {
    stubBrowser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"id":"expense-id"}', { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const payload = {
      amountMinor: '9007199254740993',
      currency: 'VND',
      participants: [{ userId: 'user-id', shareMinor: '9007199254740993' }],
    };

    await apiJson('expenses', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'create-op-1' },
      body: JSON.stringify(payload),
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toContain('/expenses');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('create-op-1');
    expect(typeof init?.body).toBe('string');
    if (typeof init?.body === 'string') expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('reuses a pending mutation key for the same account and payload, then clears it on success', async () => {
    const tokenFor = (sub: string): string =>
      `e30.${btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;
    const storage = stubBrowser(tokenFor('user-a'));
    const payload = { amountMinor: '100', currency: 'VND', description: 'Lunch' };

    const first = await getMutationIdempotencyKey('expense-create', payload);
    const retry = await getMutationIdempotencyKey('expense-create', payload);
    expect(retry.key).toBe(first.key);
    first.clear();

    const afterSuccess = await getMutationIdempotencyKey('expense-create', payload);
    expect(afterSuccess.key).not.toBe(first.key);

    storage.set('equa_access_token', tokenFor('user-b'));
    const switchedAccount = await getMutationIdempotencyKey('expense-create', payload);
    expect(switchedAccount.key).not.toBe(afterSuccess.key);
    switchedAccount.clear();

    storage.set('equa_access_token', tokenFor('user-a'));
    expect((await getMutationIdempotencyKey('expense-create', payload)).key).toBe(afterSuccess.key);
  });

  it('revokes the Identity refresh cookie before clearing a normal web session', async () => {
    const storage = stubBrowser('access-token');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await logoutSession();

    expect(fetcher.mock.calls[0]?.[0]).toContain('/auth/logout');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
    expect(storage.has('equa_access_token')).toBe(false);
  });

  it('does not call Identity when a Local Demo session logs out', async () => {
    const storage = stubBrowser(LOCAL_DEMO_TOKEN);
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    await logoutSession();

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.has('equa_access_token')).toBe(false);
  });
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
