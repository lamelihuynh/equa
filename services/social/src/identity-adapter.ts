import type {
  IdentityUserResolution,
  IdentityUserSummary,
  IdentityUsersResolutionRequest,
} from '@equa/contracts';
import type { SocialUser } from './types.js';

const INTERNAL_HTTP_TIMEOUT_MS = 3_000;

export interface IdentityDirectory {
  resolveIdentifier(identifier: string): Promise<SocialUser | undefined>;
  resolveUsers(userIds: readonly string[]): Promise<SocialUser[]>;
}

export class IdentityLookupUnavailableError extends Error {
  constructor(message = 'Identity is unavailable.') {
    super(message);
    this.name = 'IdentityLookupUnavailableError';
  }
}

export class UnavailableIdentityDirectory implements IdentityDirectory {
  resolveIdentifier(): Promise<SocialUser | undefined> {
    return Promise.reject(new IdentityLookupUnavailableError());
  }
  resolveUsers(): Promise<SocialUser[]> {
    return Promise.reject(new IdentityLookupUnavailableError());
  }
}

export class HttpIdentityDirectory implements IdentityDirectory {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async resolveIdentifier(identifier: string): Promise<SocialUser | undefined> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/internal/identity/users/resolve?identifier=${encodeURIComponent(identifier)}`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { accept: 'application/json', 'x-equa-service-key': this.serviceKey },
        signal: AbortSignal.timeout(INTERNAL_HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      throw new IdentityLookupUnavailableError(
        error instanceof Error ? error.message : 'Identity lookup failed.',
      );
    }
    if (response.status === 404) return undefined;
    if (!response.ok)
      throw new IdentityLookupUnavailableError(`Identity rejected lookup (${response.status}).`);
    try {
      const value: unknown = await response.json();
      if (!isRecord(value) || typeof value.id !== 'string')
        throw new Error('Identity returned an invalid lookup response.');
      const resolved = value as Partial<IdentityUserResolution>;
      return {
        id: value.id,
        displayName: typeof resolved.displayName === 'string' ? resolved.displayName : undefined,
        email: typeof value.email === 'string' ? value.email : undefined,
        username: typeof resolved.username === 'string' ? resolved.username : undefined,
      };
    } catch (error) {
      throw new IdentityLookupUnavailableError(
        error instanceof Error ? error.message : 'Identity returned invalid data.',
      );
    }
  }

  async resolveUsers(userIds: readonly string[]): Promise<SocialUser[]> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return [];
    const request: IdentityUsersResolutionRequest = { ids };
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl.replace(/\/$/, '')}/internal/identity/users/resolve-many`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-equa-service-key': this.serviceKey,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(INTERNAL_HTTP_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new IdentityLookupUnavailableError(
        error instanceof Error ? error.message : 'Identity lookup failed.',
      );
    }
    if (!response.ok)
      throw new IdentityLookupUnavailableError(
        `Identity rejected batch lookup (${response.status}).`,
      );
    try {
      const value: unknown = await response.json();
      if (!Array.isArray(value) || !value.every(isIdentityUserSummary))
        throw new Error('Identity returned an invalid batch lookup response.');
      return value.map((user: IdentityUserSummary) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      }));
    } catch (error) {
      throw new IdentityLookupUnavailableError(
        error instanceof Error ? error.message : 'Identity returned invalid data.',
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentityUserSummary(value: unknown): value is IdentityUserSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.email === 'string'
  );
}
