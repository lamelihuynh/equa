import type { SyncRequest, SyncResult } from '@equa/contracts';

import { SyncTransportError, type SyncTransport } from '../sync/sync-client';

export function createSyncTransport(baseUrl: string): SyncTransport {
  return {
    async push(accessToken: string, request: SyncRequest): Promise<SyncResult[]> {
      const response = await requestJson(`${baseUrl}/sync`, accessToken, 'POST', request);
      if (!Array.isArray(response.body)) {
        return request.operations.map((operation) => ({
          id: operation.id,
          status: 'failed' as const,
          retryable: false,
          code: 'INVALID_SYNC_RESPONSE',
        }));
      }
      const parsedResults = response.body.map((value): SyncResult | undefined => {
        if (typeof value !== 'object' || value === null) {
          return undefined;
        }
        const record = value as Record<string, unknown>;
        const status = record.status;
        if (
          typeof record.id !== 'string' ||
          (status !== 'applied' && status !== 'conflict' && status !== 'failed')
        )
          return undefined;
        return {
          id: record.id,
          status,
          ...(Number.isSafeInteger(record.version) ? { version: record.version as number } : {}),
          ...(typeof record.retryable === 'boolean' ? { retryable: record.retryable } : {}),
          ...(typeof record.code === 'string' ? { code: record.code } : {}),
        };
      });
      const operationIds = new Set(request.operations.map((operation) => operation.id));
      const resultIds = parsedResults.flatMap((result) => (result ? [result.id] : []));
      if (
        parsedResults.some((result) => result === undefined) ||
        resultIds.some((id) => !operationIds.has(id)) ||
        new Set(resultIds).size !== resultIds.length
      )
        return request.operations.map((operation) => ({
          id: operation.id,
          status: 'failed' as const,
          retryable: false,
          code: 'INVALID_SYNC_RESPONSE',
        }));
      return parsedResults as SyncResult[];
    },
    async pull(accessToken: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const response = await requestJson(`${baseUrl}/sync/feed${query}`, accessToken, 'GET');
      if (
        typeof response.body !== 'object' ||
        response.body === null ||
        Array.isArray(response.body) ||
        !Array.isArray((response.body as Record<string, unknown>).events)
      )
        throw new Error('Invalid sync feed response.');
      const body = response.body as { cursor?: unknown; events: unknown[] };
      return {
        cursor: typeof body.cursor === 'string' ? body.cursor : undefined,
        events: body.events,
      };
    },
  };
}

async function requestJson(
  url: string,
  accessToken: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Equa-Client': 'mobile',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new SyncTransportError(undefined, undefined, undefined, true);
  }
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!response.ok) {
    const errorCode =
      typeof parsed === 'object' && parsed !== null && 'code' in parsed
        ? typeof parsed.code === 'string'
          ? parsed.code
          : undefined
        : undefined;
    const retryAfter = response.headers.get('retry-after');
    const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
    throw new SyncTransportError(
      response.status,
      Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : undefined,
      errorCode,
    );
  }
  return { status: response.status, body: parsed };
}
