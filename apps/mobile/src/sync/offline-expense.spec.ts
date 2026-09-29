import { describe, expect, it } from 'vitest';

import { createOfflineExpenseOperation, createOfflineOperationId } from './offline-expense';

const base = {
  operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expenseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  expectedVersion: 0,
  createdAt: '2026-09-29T00:00:00.000Z',
  description: 'Offline lunch',
  amountMinor: '1500',
  currency: 'VND' as const,
  payerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  participants: [
    { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', shareMinor: '1000' },
    { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', shareMinor: '500' },
  ],
};

describe('offline expense operation', () => {
  it('builds a create operation with explicit integer shares and client metadata', () => {
    expect(
      createOfflineExpenseOperation({ ...base, groupId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
    ).toMatchObject({
      id: base.operationId,
      entity: 'expense',
      entityId: base.expenseId,
      expectedVersion: 0,
      payload: {
        action: 'create',
        expenseId: base.expenseId,
        amountMinor: '1500',
        groupId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        participants: base.participants,
      },
    });
  });

  it('builds an optimistic update and rejects invalid totals or decimal minor units', () => {
    expect(createOfflineExpenseOperation({ ...base, expectedVersion: 2 }).payload.action).toBe(
      'update',
    );
    expect(() =>
      createOfflineExpenseOperation({
        ...base,
        participants: [{ userId: base.payerId, shareMinor: '1499' }],
      }),
    ).toThrow('Tổng phần chia phải bằng số tiền.');
    expect(() => createOfflineExpenseOperation({ ...base, amountMinor: '15.00' })).toThrow(
      'Số tiền phải là số nguyên dương theo đơn vị nhỏ nhất.',
    );
  });

  it('creates RFC 4122 version 4 operation IDs', () => {
    expect(createOfflineOperationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
