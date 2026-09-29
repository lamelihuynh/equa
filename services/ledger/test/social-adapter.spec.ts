import { describe, expect, it, vi } from 'vitest';

import { HttpLedgerSocialAdapter } from '../src/social-adapter.js';

describe('HttpLedgerSocialAdapter', () => {
  it('uses the Ledger service key and a bounded request signal', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"member":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const adapter = new HttpLedgerSocialAdapter('http://social.test/', 'ledger-key', fetcher);

    await expect(adapter.isGroupMember('group-id', 'user-id')).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://social.test/internal/groups/member',
      expect.objectContaining({
        headers: { 'content-type': 'application/json', 'x-equa-service-key': 'ledger-key' },
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('surfaces a timed-out Social request instead of treating it as membership', async () => {
    const adapter = new HttpLedgerSocialAdapter(
      'http://social.test',
      'ledger-key',
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );

    await expect(adapter.isGroupMember('group-id', 'user-id')).rejects.toThrow('timed out');
  });
});
