import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSyncTransport } from './sync-api.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Mobile Sync HTTP transport', () => {
  it('attaches a bounded request signal to push calls', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '[{"id":"00000000-0000-4000-8000-000000000001","status":"applied","version":1}]',
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const transport = createSyncTransport('http://gateway.test/v1');

    await expect(
      transport.push('access-token', {
        version: 1,
        deviceId: 'device-1',
        operations: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            entity: 'expense',
            expectedVersion: 0,
            payload: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ).resolves.toMatchObject([
      { id: '00000000-0000-4000-8000-000000000001', status: 'applied', version: 1 },
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends explicit server-wins conflict resolution through the authenticated Sync API', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"resolved":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const operationId = '00000000-0000-4000-8000-000000000001';
    const transport = createSyncTransport('http://gateway.test/v1');

    await transport.resolveConflict?.('access-token', {
      version: 1,
      deviceId: 'device-1',
      operationId,
      resolution: 'discard',
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`http://gateway.test/v1/sync/conflicts/${operationId}/resolve`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
    expect(init?.body).toBe(
      JSON.stringify({ version: 1, deviceId: 'device-1', operationId, resolution: 'discard' }),
    );
  });

  it('converts a stalled push into a retryable network failure at the deadline', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const transport = createSyncTransport('http://gateway.test/v1');
    const operation = {
      id: '00000000-0000-4000-8000-000000000002',
      entity: 'expense',
      expectedVersion: 0,
      payload: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    } as const;

    const request = transport.push('access-token', {
      version: 1,
      deviceId: 'device-1',
      operations: [operation],
    });
    const timeoutExpectation = expect(request).rejects.toMatchObject({ retryable: true });
    await vi.advanceTimersByTimeAsync(20_000);
    await timeoutExpectation;
  });
});
