import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiJson,
  getMutationIdempotencyKey,
  LOCAL_DEMO_TOKEN,
  logoutSession,
  SessionExpiredError,
} from './api-client.js';
import type { ApiClientError } from './api-client.js';

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

afterEach(() => vi.unstubAllGlobals());

describe('Equa web API client', () => {
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
