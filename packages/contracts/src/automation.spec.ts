import { describe, expect, it } from 'vitest';

import { parseDomainEvent, parseSyncRequest } from './automation';

describe('automation contracts', () => {
  it('accepts only versioned sync operations with optimistic versions', () => {
    expect(
      parseSyncRequest({
        version: 1,
        deviceId: 'device-1',
        operations: [
          {
            id: 'op-1',
            entity: 'expense',
            expectedVersion: 0,
            payload: {},
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    ).toBeDefined();
    expect(parseSyncRequest({ version: 2, deviceId: 'device-1', operations: [] })).toBeUndefined();
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
});
