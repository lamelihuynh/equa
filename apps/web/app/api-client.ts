'use client';

export const LOCAL_DEMO_TOKEN = 'local-demo-token';
export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1'
).replace(/\/+$/, '');

let refreshInFlight: { expectedToken: string; promise: Promise<string | undefined> } | undefined;

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class SessionExpiredError extends ApiClientError {
  constructor() {
    super('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 401, 'SESSION_EXPIRED');
    this.name = 'SessionExpiredError';
  }
}

export function isLocalDemoSession(): boolean {
  return (
    typeof window !== 'undefined' &&
    sessionStorage.getItem('equa_access_token') === LOCAL_DEMO_TOKEN
  );
}

export function currentUserId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const token = sessionStorage.getItem('equa_access_token');
  const body = token?.split('.')[1];
  if (!body) return undefined;
  try {
    const normalized = body.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    );
    return isRecord(payload) && typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

/** Reuses a per-account mutation key after an ambiguous network failure without storing payload data. */
export async function getMutationIdempotencyKey(
  scope: string,
  payload: unknown,
): Promise<{ key: string; clear: () => void }> {
  const userId = currentUserId();
  if (!userId) throw new ApiClientError('Không thể xác định tài khoản đang đăng nhập.', 401);
  const serialized = JSON.stringify(payload);
  if (serialized === undefined)
    throw new ApiClientError('Không thể định danh yêu cầu tài chính.', 400);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const storageKey = `equa_pending_mutation:${userId}:${scope}:${fingerprint}`;
  const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
  sessionStorage.setItem(storageKey, key);
  return { key, clear: () => sessionStorage.removeItem(storageKey) };
}

export async function apiJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await apiRequest(path, init);
  let value: unknown;
  if (response.status !== 204) {
    try {
      value = await response.json();
    } catch {
      value = undefined;
    }
  }
  if (!response.ok) {
    const record = isRecord(value) ? value : undefined;
    throw new ApiClientError(
      typeof record?.message === 'string'
        ? record.message
        : `Yêu cầu thất bại (${response.status}).`,
      response.status,
      typeof record?.code === 'string' ? record.code : undefined,
    );
  }
  return value;
}

export async function logoutSession(): Promise<void> {
  const token = sessionStorage.getItem('equa_access_token');
  try {
    if (token && token !== LOCAL_DEMO_TOKEN) {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Correlation-ID': crypto.randomUUID(),
        },
        signal: AbortSignal.timeout(3_000),
      });
    }
  } catch {
    // Local session teardown must finish even when Identity is unreachable.
  } finally {
    sessionStorage.removeItem('equa_access_token');
    sessionStorage.removeItem('equa_user_email');
  }
}

async function apiRequest(path: string, init: RequestInit): Promise<Response> {
  if (typeof window === 'undefined')
    throw new ApiClientError('API client chỉ chạy trong trình duyệt.', 500);
  const token = sessionStorage.getItem('equa_access_token');
  if (!token || token === LOCAL_DEMO_TOKEN)
    throw new ApiClientError('Hãy đăng nhập bằng tài khoản Equa để dùng dữ liệu máy chủ.', 401);

  const first = await send(path, init, token);
  if (sessionStorage.getItem('equa_access_token') !== token)
    throw new ApiClientError(
      'Phiên đăng nhập đã thay đổi trong khi gửi yêu cầu.',
      409,
      'SESSION_CHANGED',
    );
  if (first.status !== 401) return first;
  const refreshed = await refreshAccessToken(token);
  if (!refreshed) {
    if (sessionStorage.getItem('equa_access_token') === token) {
      expireSession(token);
      throw new SessionExpiredError();
    }
    throw new ApiClientError(
      'Phiên đăng nhập đã thay đổi trong khi gửi yêu cầu.',
      409,
      'SESSION_CHANGED',
    );
  }
  if (sessionStorage.getItem('equa_access_token') !== refreshed)
    throw new ApiClientError(
      'Phiên đăng nhập đã thay đổi trong khi gửi yêu cầu.',
      409,
      'SESSION_CHANGED',
    );
  const retried = await send(path, init, refreshed);
  if (sessionStorage.getItem('equa_access_token') !== refreshed)
    throw new ApiClientError(
      'Phiên đăng nhập đã thay đổi trong khi gửi yêu cầu.',
      409,
      'SESSION_CHANGED',
    );
  if (retried.status === 401) {
    if (sessionStorage.getItem('equa_access_token') === refreshed) {
      expireSession(refreshed);
      throw new SessionExpiredError();
    }
    throw new ApiClientError(
      'Phiên đăng nhập đã thay đổi trong khi gửi yêu cầu.',
      409,
      'SESSION_CHANGED',
    );
  }
  return retried;
}

function send(path: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Correlation-ID', crypto.randomUUID());
  if (typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  return fetch(`${apiBaseUrl}/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}

function refreshAccessToken(expectedToken: string): Promise<string | undefined> {
  if (refreshInFlight?.expectedToken === expectedToken) return refreshInFlight.promise;
  const promise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Correlation-ID': crypto.randomUUID() },
      });
      if (!response.ok) return undefined;
      const value: unknown = await response.json();
      if (!isRecord(value) || typeof value.accessToken !== 'string') return undefined;
      if (sessionStorage.getItem('equa_access_token') !== expectedToken) return undefined;
      sessionStorage.setItem('equa_access_token', value.accessToken);
      return value.accessToken;
    } catch {
      return undefined;
    }
  })();
  refreshInFlight = { expectedToken, promise };
  void promise.then(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = undefined;
  });
  return promise;
}

function expireSession(expectedToken: string): void {
  if (sessionStorage.getItem('equa_access_token') !== expectedToken) return;
  sessionStorage.removeItem('equa_access_token');
  sessionStorage.removeItem('equa_user_email');
  sessionStorage.setItem('equa_session_expired', '1');
  window.dispatchEvent(new Event('equa-session-expired'));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
