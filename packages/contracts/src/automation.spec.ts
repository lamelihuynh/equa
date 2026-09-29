import { describe, expect, it } from 'vitest';

import { parseDomainEvent, parseSyncConflictResolution, parseSyncRequest } from './automation';

describe('automation contracts', () => {
  it('accepts only versioned sync operations with optimistic versions', () => {
    expect(
      parseSyncRequest({
        version: 1,
        deviceId: 'device-1',
        operations: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            entity: 'expense',
            expectedVersion: 0,
            payload: {},
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    ).toBeDefined();
    expect(parseSyncRequest({ version: 2, deviceId: 'device-1', operations: [] })).toBeUndefined();
    expect(
      parseSyncRequest({
        version: 1,
        deviceId: 'device-1',
        operations: [
          {
            id: 'operation-text',
            entity: 'expense',
            expectedVersion: 0,
            payload: {},
            createdAt: 'now',
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('requires a stable domain event identity', () => {
    expect(
      parseDomainEvent({
        version: 1,
        id: 'e-1',
        type: 'expense.created',
        occurredAt: 'now',
        ownerId: 'u-1',
        payload: {},
      }),
    ).toBeDefined();
    expect(parseDomainEvent({ version: 1, type: 'expense.created', payload: {} })).toBeUndefined();
  });

  it('accepts only a versioned discard action for a UUID operation receipt', () => {
    expect(
      parseSyncConflictResolution({
        version: 1,
        deviceId: 'device-1',
        operationId: '00000000-0000-4000-8000-000000000001',
        resolution: 'discard',
      }),
    ).toBeDefined();
    expect(
      parseSyncConflictResolution({
        version: 1,
        deviceId: 'device-1',
        operationId: 'not-a-uuid',
        resolution: 'discard',
      }),
    ).toBeUndefined();
  });
});
