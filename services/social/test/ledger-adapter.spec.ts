import { describe, expect, it, vi } from 'vitest';

import { HttpSocialLedgerAdapter, LedgerUnavailableError } from '../src/ledger-adapter.js';

describe('HttpSocialLedgerAdapter', () => {
  it('uses the service key and a bounded request signal', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 'alice',
          counterpartyId: 'bob',
          balances: [],
          netMinor: '0',
          currency: null,
          hasOutstandingDebt: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const adapter = new HttpSocialLedgerAdapter('http://ledger.test/', 'service-secret', fetcher);

    await expect(adapter.pairBalance('alice', 'bob')).resolves.toMatchObject({
      hasOutstandingDebt: false,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://ledger.test/internal/balances/pair',
      expect.objectContaining({
        headers: { 'content-type': 'application/json', 'x-equa-service-key': 'service-secret' },
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps timed-out Ledger requests fail-closed as unavailable', async () => {
    const adapter = new HttpSocialLedgerAdapter(
      'http://ledger.test',
      'service-secret',
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );

    await expect(adapter.hasOutstandingDebt('alice', 'bob')).rejects.toBeInstanceOf(
      LedgerUnavailableError,
    );
  });
});
