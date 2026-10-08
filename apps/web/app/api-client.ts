'use client';

export const LOCAL_DEMO_TOKEN = 'local-demo-token';
export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1'
).replace(/\/+$/, '');

const identityWakeRetryDelaysMs = [
  2_000, 4_000, 8_000, 16_000, 20_000, 20_000, 20_000, 20_000, 20_000,
] as const;
const transientGatewayStatuses = new Set([502, 503, 504]);
const identityWakeBudgetMs = identityWakeRetryDelaysMs.reduce((total, delay) => total + delay, 0);

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

/** Wakes Identity safely through the Gateway before sending an auth mutation exactly once. */
export async function authJson(path: string, payload: unknown): Promise<unknown> {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined)
    throw new ApiClientError('Không thể tạo nội dung yêu cầu xác thực.', 400);

  await waitForIdentityThroughGateway();

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/${path.replace(/^\//, '')}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': crypto.randomUUID(),
      },
      body: serialized,
    });
  } catch {
    throw new ApiClientError(
      'Không nhận được phản hồi từ Gateway khi gửi yêu cầu xác thực. Hãy kiểm tra kết nối rồi thử lại.',
      0,
      'AUTH_NETWORK_ERROR',
    );
  }

  const value = await readJsonBody(response);
  if (!response.ok) throw authResponseError(response.status, value);
  if (value === undefined)
    throw new ApiClientError(
      `Gateway returned a non-JSON response (HTTP ${response.status}).`,
      response.status,
      'NON_JSON_AUTH_RESPONSE',
    );
  return value;
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

async function waitForIdentityThroughGateway(): Promise<void> {
  const deadline = Date.now() + identityWakeBudgetMs;
  const identityHealthUrl = process.env.NEXT_PUBLIC_IDENTITY_HEALTH_URL;
  if (identityHealthUrl) await waitForReadiness(identityHealthUrl, 'Identity', deadline);
  await waitForReadiness(gatewayReadinessUrl(), 'Gateway', deadline);
}

async function waitForReadiness(
  readyUrl: string,
  serviceName: 'Identity' | 'Gateway',
  deadline: number,
): Promise<void> {
  let lastStatus: number | undefined;
  let lastFailureWasNetwork = false;

  for (let attempt = 0; attempt <= identityWakeRetryDelaysMs.length; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), Math.min(8_000, remaining));
    try {
      const response = await fetch(readyUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      const healthBody = response.ok ? await readJsonBody(response) : undefined;
      if (isRecord(healthBody) && healthBody.status === 'ok' && healthBody.service === 'identity')
        return;

      lastStatus = response.ok ? 502 : response.status;
      lastFailureWasNetwork = false;
      if (!transientGatewayStatuses.has(lastStatus)) {
        throw authResponseError(
          lastStatus,
          await readJsonBody(response),
          `${serviceName} readiness`,
        );
      }
      await response.body?.cancel();
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      lastStatus = undefined;
      lastFailureWasNetwork = true;
    } finally {
      globalThis.clearTimeout(timeout);
    }

    const delay = identityWakeRetryDelaysMs[attempt];
    if (delay !== undefined) await wait(Math.min(delay, Math.max(0, deadline - Date.now())));
  }

  if (lastStatus !== undefined)
    throw new ApiClientError(
      `${serviceName} chưa sẵn sàng sau khoảng 2 phút (HTTP ${lastStatus}). Hãy thử lại sau.`,
      lastStatus,
      'IDENTITY_NOT_READY',
    );
  throw new ApiClientError(
    lastFailureWasNetwork
      ? `Không thể kết nối tới ${serviceName} sau khoảng 2 phút.`
      : `${serviceName} chưa sẵn sàng sau khoảng 2 phút.`,
    0,
    'IDENTITY_NOT_READY',
  );
}

function gatewayReadinessUrl(): string {
  const directGatewayHealthUrl = process.env.NEXT_PUBLIC_GATEWAY_HEALTH_URL;
  if (directGatewayHealthUrl) return directGatewayHealthUrl;
  if (apiBaseUrl === '/v1') return `${apiBaseUrl}/auth/_ready`;
  return `${apiBaseUrl.replace(/\/v1\/?$/, '')}/health`;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function authResponseError(
  status: number,
  value: unknown,
  context = 'Yêu cầu xác thực',
): ApiClientError {
  const body = isRecord(value) ? value : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const codeSuffix = code ? ` (${code})` : '';
  if (typeof body?.message === 'string')
    return new ApiClientError(`HTTP ${status}${codeSuffix}: ${body.message}`, status, code);

  if (status === 502 || status === 503 || status === 504)
    return new ApiClientError(
      `Gateway/Identity chưa sẵn sàng (HTTP ${status}). Hãy thử lại sau.`,
      status,
      code,
    );
  return new ApiClientError(`${context} thất bại (HTTP ${status}${codeSuffix}).`, status, code);
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}
