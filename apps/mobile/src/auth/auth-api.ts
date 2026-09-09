import type { SessionApi, TokenPair } from './session';

interface IdentityResponse {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface MobileAuthApi extends SessionApi {
  login(email: string, password: string): Promise<TokenPair>;
}

/** Identity only includes a refresh token in its JSON response for this client. */
export function createMobileAuthApi(baseUrl: string): MobileAuthApi {
  const requestTokens = async (path: string, body: Record<string, string>): Promise<TokenPair> => {
    const response = await fetch(`${baseUrl}/auth/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Equa-Client': 'mobile',
      },
      body: JSON.stringify(body),
    });
    const value: unknown = await response.json();
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
