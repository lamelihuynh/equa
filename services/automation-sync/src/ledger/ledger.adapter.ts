import type { SyncOperation } from '@equa/contracts';

export type LedgerAvailability = 'available' | 'unavailable';

export class LedgerUnavailableError extends Error {}

export class LedgerUnsupportedOperationError extends Error {
  readonly code = 'UNSUPPORTED_ENTITY';
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'LedgerUnsupportedOperationError';
  }
}

export class LedgerPermanentError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LedgerPermanentError';
  }
}

export interface LedgerAdapter {
  readonly availability?: LedgerAvailability;
  createRecurringOccurrence(input: {
    idempotencyKey: string;
    ownerId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  applySync(
    ownerId: string,
    deviceId: string,
    operation: SyncOperation,
  ): Promise<{ version: number }>;
  readFeed(ownerId: string, cursor?: string): Promise<{ cursor?: string; events: unknown[] }>;
}

/** Disabled by default: no financial write can succeed until Ledger provides its atomic API. */
export class DisabledLedgerAdapter implements LedgerAdapter {
  readonly availability = 'unavailable' as const;
  private unavailable(): LedgerUnavailableError {
    return new LedgerUnavailableError(
      'Ledger integration is unavailable; automation and sync fail closed.',
    );
  }
  createRecurringOccurrence(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
  applySync(): Promise<{ version: number }> {
    return Promise.reject(this.unavailable());
  }
  readFeed(): Promise<{ cursor?: string; events: unknown[] }> {
    return Promise.reject(this.unavailable());
  }
}

export class HttpLedgerAdapter implements LedgerAdapter {
  readonly availability = 'available' as const;
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createRecurringOccurrence(input: {
    idempotencyKey: string;
    ownerId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.request('/internal/expenses', input, input.idempotencyKey);
  }

  async applySync(
    ownerId: string,
    deviceId: string,
    operation: SyncOperation,
  ): Promise<{ version: number }> {
    const entityId = expenseEntityId(operation);
    if (!entityId)
      throw new LedgerUnsupportedOperationError(`Unsupported sync entity: ${operation.entity}`);
    const payload = {
      ...operation.payload,
      ownerId,
      deviceId,
      expectedVersion: operation.expectedVersion,
    };
    const value = await this.request<{ version: number }>(
      `/internal/sync/expense/${encodeURIComponent(entityId)}`,
      payload,
      operation.id,
    );
    if (!Number.isSafeInteger(value.version))
      throw new Error('Ledger returned an invalid version.');
    return value;
  }

  async readFeed(
    ownerId: string,
    cursor?: string,
  ): Promise<{ cursor?: string; events: unknown[] }> {
    const query = cursor
      ? `?ownerId=${encodeURIComponent(ownerId)}&cursor=${encodeURIComponent(cursor)}`
      : `?ownerId=${encodeURIComponent(ownerId)}`;
    return this.request<{ cursor?: string; events: unknown[] }>(`/internal/ledger/feed${query}`);
  }

  private async request<T = unknown>(
    path: string,
    body?: object,
    idempotencyKey?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          'x-equa-service-key': this.serviceKey,
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new LedgerUnavailableError(
        error instanceof Error ? error.message : 'Ledger request failed.',
      );
    }
    if (!response.ok) {
      let responseCode: string | undefined;
      try {
        const body: unknown = await response.clone().json();
        if (typeof body === 'object' && body !== null && 'code' in body)
          responseCode = typeof body.code === 'string' ? body.code : undefined;
      } catch {
        responseCode = undefined;
      }
      if (response.status >= 500)
        throw new LedgerUnavailableError(`Ledger returned ${response.status}.`);
      if (response.status === 404)
        throw new LedgerPermanentError(
          `Ledger returned ${response.status}.`,
          responseCode ?? 'NOT_FOUND',
          response.status,
        );
      if (response.status === 409)
        throw Object.assign(new Error('Ledger operation conflicted.'), { code: 'CONFLICT' });
      throw new LedgerPermanentError(
        `Ledger rejected request (${response.status}).`,
        responseCode ?? 'LEDGER_REJECTED',
        response.status,
      );
    }
    return (await response.json()) as T;
  }
}

function expenseEntityId(operation: SyncOperation): string | undefined {
  if (operation.entity === 'expense') {
    const value = operation.entityId ?? operation.payload.expenseId ?? operation.id;
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
  if (operation.entity.startsWith('expense:')) {
    const value = operation.entity.slice('expense:'.length);
    return value.trim() || undefined;
  }
  return undefined;
}
