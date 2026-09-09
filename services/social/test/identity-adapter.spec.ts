import { describe, expect, it, vi } from 'vitest';

import { HttpIdentityDirectory, IdentityLookupUnavailableError } from '../src/identity-adapter.js';

describe('HttpIdentityDirectory', () => {
  it('resolves users through the internal service-key route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'bob', email: 'bob@example.test', username: 'bob' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const directory = new HttpIdentityDirectory('http://identity.test/', 'shared-key', fetcher);

    await expect(directory.resolveIdentifier('Bob')).resolves.toEqual({
      id: 'bob',
      email: 'bob@example.test',
      username: 'bob',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://identity.test/internal/identity/users/resolve?identifier=Bob',
      expect.objectContaining({
        headers: { accept: 'application/json', 'x-equa-service-key': 'shared-key' },
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
  });
});
