import type { PairBalance } from './types.js';

export class LedgerUnavailableError extends Error {
  constructor(message = 'Ledger is unavailable.') {
    super(message);
    this.name = 'LedgerUnavailableError';
  }
}

export interface SocialLedgerAdapter {
  pairBalance(userId: string, counterpartyId: string): Promise<PairBalance>;
  hasOutstandingDebt(userId: string, counterpartyId: string): Promise<boolean>;
  hasOutstandingGroupDebt(groupId: string, userId: string): Promise<boolean>;
}

export class FailClosedLedgerAdapter implements SocialLedgerAdapter {
  private unavailable(): LedgerUnavailableError {
    return new LedgerUnavailableError();
  }
  pairBalance(): Promise<PairBalance> {
    return Promise.reject(this.unavailable());
  }
  hasOutstandingDebt(): Promise<boolean> {
    return Promise.reject(this.unavailable());
  }
  hasOutstandingGroupDebt(): Promise<boolean> {
    return Promise.reject(this.unavailable());
  }
}

export class HttpSocialLedgerAdapter implements SocialLedgerAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async pairBalance(userId: string, counterpartyId: string): Promise<PairBalance> {
    return this.request<PairBalance>('/internal/balances/pair', { userId, counterpartyId });
  }

  async hasOutstandingDebt(userId: string, counterpartyId: string): Promise<boolean> {
    const result = await this.request<{ hasOutstandingDebt: boolean }>('/internal/balances/debt', {
      userId,
      counterpartyId,
    });
    return result.hasOutstandingDebt;
  }

  async hasOutstandingGroupDebt(groupId: string, userId: string): Promise<boolean> {
    const result = await this.request<{ hasOutstandingDebt: boolean }>(
      '/internal/balances/group-debt',
      { groupId, userId },
    );
    return result.hasOutstandingDebt;
  }

  private async request<T>(path: string, body: object): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-equa-service-key': this.serviceKey },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new LedgerUnavailableError(
        error instanceof Error ? error.message : 'Ledger request failed.',
      );
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 404) throw new LedgerUnavailableError();
      throw new Error(`Ledger rejected request (${response.status}).`);
    }
    return (await response.json()) as T;
  }
}
