import type { IdentityUserResolution } from '@equa/contracts';
import type { SocialUser } from './types.js';

export interface IdentityDirectory {
  resolveIdentifier(identifier: string): Promise<SocialUser | undefined>;
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
        email: typeof value.email === 'string' ? value.email : undefined,
        username: typeof resolved.username === 'string' ? resolved.username : undefined,
      };
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
