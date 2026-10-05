import { describe, expect, it, vi } from 'vitest';

import { HttpIdentityDirectory, IdentityLookupUnavailableError } from '../src/identity-adapter.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpIdentityDirectory', () => {
  it('resolves users through the internal service-key route', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse({
        id: 'bob',
        displayName: 'Bob Example',
        email: 'bob@example.test',
        username: 'bob',
      }),
    );
    const directory = new HttpIdentityDirectory('http://identity.test/', 'shared-key', fetcher);

    await expect(directory.resolveIdentifier('Bob')).resolves.toEqual({
      id: 'bob',
      displayName: 'Bob Example',
      email: 'bob@example.test',
      username: 'bob',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://identity.test/internal/identity/users/resolve?identifier=Bob',
      expect.objectContaining({
        headers: { accept: 'application/json', 'x-equa-service-key': 'shared-key' },
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('batch-resolves identities with one authenticated request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse([
        { id: 'alice-id', displayName: 'Alice', email: 'alice@example.test' },
        { id: 'bob-id', displayName: 'Bob', email: 'bob@example.test' },
      ]),
    );
    const directory = new HttpIdentityDirectory('http://identity.test/', 'shared-key', fetcher);

    await expect(directory.resolveUsers(['alice-id', 'bob-id', 'alice-id'])).resolves.toEqual([
      { id: 'alice-id', displayName: 'Alice', email: 'alice@example.test' },
      { id: 'bob-id', displayName: 'Bob', email: 'bob@example.test' },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'http://identity.test/internal/identity/users/resolve-many',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-equa-service-key': 'shared-key',
        },
        body: JSON.stringify({ ids: ['alice-id', 'bob-id'] }),
      }),
    );
  });

  it('distinguishes not found from an unavailable Identity service', async () => {
    const notFound = new HttpIdentityDirectory(
      'http://identity.test',
      'shared-key',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(notFound.resolveIdentifier('missing')).resolves.toBeUndefined();

    const unavailable = new HttpIdentityDirectory(
      'http://identity.test',
      'shared-key',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(unavailable.resolveIdentifier('bob')).rejects.toBeInstanceOf(
      IdentityLookupUnavailableError,
    );

    const timedOut = new HttpIdentityDirectory(
      'http://identity.test',
      'shared-key',
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );
    await expect(timedOut.resolveIdentifier('bob')).rejects.toBeInstanceOf(
      IdentityLookupUnavailableError,
    );
  });
});
