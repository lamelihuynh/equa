import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileApiClient } from './mobile-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MobileApiClient', () => {
  it('builds authenticated Social requests against the configured Gateway', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    const api = new MobileApiClient(
      'https://gateway.example.test/v1/',
      () => Promise.resolve('access'),
      fetcher,
    );

    await api.getFriends();

    const call = fetcher.mock.calls[0];
    expect(call?.[0]).toBe('https://gateway.example.test/v1/friends');
    expect(call?.[1]?.method).toBe('GET');
    expect(call?.[1]?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer access',
      'X-Equa-Client': 'mobile',
    });
  });

  it('refreshes once after an expired access token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    const token = vi
      .fn()
      .mockResolvedValueOnce('expired-access')
      .mockResolvedValueOnce('fresh-access');
    const api = new MobileApiClient('https://gateway.example.test/v1', token, fetcher);

    await api.getGroups();

    expect(token).toHaveBeenNthCalledWith(2, true);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-access',
    });
  });

  it('sends explicit JSON and an idempotency key for financial mutations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'expense-id' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const api = new MobileApiClient(
      'https://gateway.example.test/v1',
      () => Promise.resolve('access'),
      fetcher,
    );
    const input = {
      amountMinor: '50000',
      currency: 'VND' as const,
      description: 'Lunch',
      payerId: 'user-a',
      participants: [{ userId: 'user-a', shareMinor: '50000' }],
    };

    await api.createExpense(input, 'operation-id');

    const call = fetcher.mock.calls[0];
    expect(call?.[0]).toBe('https://gateway.example.test/v1/expenses');
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'operation-id',
    });
    expect(call?.[1]?.body).toBe(JSON.stringify(input));
  });

  it('does not expose provider invitation tokens through its declared model', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'invite-id',
          groupId: 'group-id',
          status: 'pending',
          createdAt: '2026-10-05T00:00:00.000Z',
          token: 'secret-code',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const api = new MobileApiClient(
      'https://gateway.example.test/v1',
      () => Promise.resolve('access'),
      fetcher,
    );

    const invitation = await api.inviteToGroup('group-id', 'classmate@example.test');

    expect(invitation.id).toBe('invite-id');
    expect(invitation).toEqual({
      id: 'invite-id',
      groupId: 'group-id',
      targetEmail: 'classmate@example.test',
      status: 'pending',
      createdAt: '2026-10-05T00:00:00.000Z',
    });
  });
});
