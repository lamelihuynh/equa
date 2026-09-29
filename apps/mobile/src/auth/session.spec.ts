import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  values: new Map<string, string>(),
  setItemAsync: vi.fn<(key: string, value: string) => Promise<void>>(),
}));
const { values, setItemAsync } = secureStore;

vi.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => Promise.resolve(secureStore.values.get(key) ?? null),
  setItemAsync: secureStore.setItemAsync,
  deleteItemAsync: (key: string) => {
    secureStore.values.delete(key);
    return Promise.resolve();
  },
}));

import { createMobileAuthApi } from './auth-api';
import { SessionManager } from './session';

const tokens = (accessToken: string, refreshToken: string) => ({ accessToken, refreshToken });

describe('mobile authentication and session persistence', () => {
  beforeEach(() => {
    values.clear();
    setItemAsync.mockReset();
    setItemAsync.mockImplementation((key, value) => {
      values.set(key, value);
      return Promise.resolve();
    });
  });

  it('sends the Identity mobile client header on actual login and refresh requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(tokens('access', 'refresh')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const api = createMobileAuthApi('https://identity.test/v1');
      await api.login('one@example.test', 'password');
      await api.refresh('refresh');
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://identity.test/v1/auth/login',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'X-Equa-Client': 'mobile' },
          body: JSON.stringify({ email: 'one@example.test', password: 'password' }),
        }),
      );
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
      expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://identity.test/v1/auth/refresh',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'X-Equa-Client': 'mobile' },
          body: JSON.stringify({ refreshToken: 'refresh' }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('aborts a stalled Identity refresh so sync can recover instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const api = createMobileAuthApi('https://identity.test/v1');
      const request = api.refresh('refresh');
      const timeoutExpectation = expect(request).rejects.toThrow('Identity request timed out.');

      await vi.advanceTimersByTimeAsync(15_000);
      await timeoutExpectation;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('invalidates an ambiguous refresh token and never replays the same rotation request', async () => {
    let calls = 0;
    const session = new SessionManager({
      refresh: () => {
        calls += 1;
        return Promise.reject(new Error('response lost after server rotation'));
      },
    });
    const epoch = session.begin();
    await session.save(tokens('access', 'refresh'), epoch);

    await expect(session.refresh()).rejects.toThrow('response lost after server rotation');
    expect(await session.accessToken()).toBeNull();
    await expect(session.refresh()).rejects.toThrow('Session refresh was invalidated');
    expect(calls).toBe(1);
  });

  it('does not leave a stale token after logout starts while persistence is pending', async () => {
    let releaseAccess: (() => void) | undefined;
    setItemAsync.mockImplementation((key, value) => {
      values.set(key, value);
      if (key === 'equa_access_token')
        return new Promise<void>((resolve) => {
          releaseAccess = resolve;
        });
      return Promise.resolve();
    });
    const session = new SessionManager({
      refresh: () => Promise.resolve(tokens('new', 'new-refresh')),
    });
    const epoch = session.begin();
    const save = session.save(tokens('old', 'old-refresh'), epoch);
    await vi.waitFor(() => expect(releaseAccess).toBeDefined());
    const logout = session.clear();
    releaseAccess?.();
    await expect(save).resolves.toBe(false);
    await logout;
    expect(values.get('equa_access_token')).toBeUndefined();
    expect(values.get('equa_refresh_token')).toBeUndefined();
  });

  it('only persists the newer account when an earlier login or refresh completes late', async () => {
    const session = new SessionManager({
      refresh: () => Promise.resolve(tokens('unused', 'unused')),
    });
    const firstEpoch = session.begin();
    const firstSave = session.save(tokens('account-one', 'refresh-one'), firstEpoch);
    const secondEpoch = session.begin();
    const secondSave = session.save(tokens('account-two', 'refresh-two'), secondEpoch);
    await expect(firstSave).resolves.toBe(false);
    await expect(secondSave).resolves.toBe(true);
    expect(values.get('equa_access_token')).toBe('account-two');
    expect(values.get('equa_refresh_token')).toBe('refresh-two');
  });

  it('rejects a refresh result that completed after the session changed', async () => {
    let resolveRefresh: ((value: ReturnType<typeof tokens>) => void) | undefined;
    values.set('equa_refresh_token', 'old-refresh');
    const session = new SessionManager({
      refresh: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    });
    const refresh = session.refresh();
    await vi.waitFor(() => expect(resolveRefresh).toBeDefined());
    const nextEpoch = session.begin();
    resolveRefresh?.(tokens('late-access', 'late-refresh'));
    await expect(refresh).rejects.toThrow('Session changed while refreshing.');
    await expect(session.save(tokens('current', 'current-refresh'), nextEpoch)).resolves.toBe(true);
    expect(values.get('equa_access_token')).toBe('current');
  });

  it('does not let an old refresh promise block the next account refresh', async () => {
    const resolvers: Array<(value: ReturnType<typeof tokens>) => void> = [];
    values.set('equa_refresh_token', 'old-refresh');
    const session = new SessionManager({
      refresh: () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    });
    const oldRefresh = session.refresh();
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    const epoch = session.begin();
    await session.save(tokens('new-access', 'new-refresh'), epoch);
    const newRefresh = session.refresh();
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[0]?.(tokens('old-access', 'old-refresh'));
    resolvers[1]?.(tokens('rotated-access', 'rotated-refresh'));
    await expect(oldRefresh).rejects.toThrow('Session changed while refreshing.');
    await expect(newRefresh).resolves.toEqual(tokens('rotated-access', 'rotated-refresh'));
    expect(values.get('equa_access_token')).toBe('rotated-access');
  });
});
