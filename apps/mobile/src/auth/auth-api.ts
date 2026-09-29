import type { SessionApi, TokenPair } from './session';

interface IdentityResponse {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export interface MobileAuthApi extends SessionApi {
  login(email: string, password: string): Promise<TokenPair>;
}

/** Identity only includes a refresh token in its JSON response for this client. */
export function createMobileAuthApi(baseUrl: string): MobileAuthApi {
  const requestTokens = async (path: string, body: Record<string, string>): Promise<TokenPair> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
    let response: Response;
    let value: unknown;
    try {
      response = await fetch(`${baseUrl}/auth/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Equa-Client': 'mobile',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      value = await response.json();
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('Identity request timed out.', { cause: error });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !isIdentityResponse(value) || !value.accessToken || !value.refreshToken)
      throw new Error(
        value && isIdentityResponse(value)
          ? (value.message ?? 'Session request failed.')
          : 'Session request failed.',
      );
    return { accessToken: value.accessToken, refreshToken: value.refreshToken };
  };
  return {
    login: (email, password) => requestTokens('login', { email, password }),
    refresh: (refreshToken) => requestTokens('refresh', { refreshToken }),
  };
}

function isIdentityResponse(value: unknown): value is IdentityResponse {
  return typeof value === 'object' && value !== null;
}
