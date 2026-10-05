import type { SupportedCurrency, SyncOperation } from '@equa/contracts';

export interface OfflineExpenseDraft {
  operationId: string;
  expenseId: string;
  expectedVersion: number;
  createdAt: string;
  description: string;
  amountMinor: string;
  currency: SupportedCurrency;
  payerId: string;
  participants: Array<{ userId: string; shareMinor: string }>;
  groupId?: string;
  friendId?: string;
  categoryId?: string;
}

export function createOfflineExpenseOperation(draft: OfflineExpenseDraft): SyncOperation {
  if (!draft.description.trim()) throw new Error('Mô tả khoản chi là bắt buộc.');
  const amount = positiveMinor(draft.amountMinor, 'Số tiền');
  if (!draft.participants.length) throw new Error('Chọn ít nhất một người tham gia.');
  const ids = new Set<string>();
  let total = 0n;
  for (const participant of draft.participants) {
    if (!participant.userId || ids.has(participant.userId))
      throw new Error('Người tham gia phải là duy nhất.');
    ids.add(participant.userId);
    total += nonNegativeMinor(participant.shareMinor, 'Phần chia');
  }
  if (total !== amount) throw new Error('Tổng phần chia phải bằng số tiền.');
  if (!Number.isSafeInteger(draft.expectedVersion) || draft.expectedVersion < 0)
    throw new Error('Phiên bản khoản chi không hợp lệ.');

  return {
    id: draft.operationId,
    entity: 'expense',
    entityId: draft.expenseId,
    expectedVersion: draft.expectedVersion,
    createdAt: draft.createdAt,
    payload: {
      action: draft.expectedVersion === 0 ? 'create' : 'update',
      expenseId: draft.expenseId,
      amountMinor: amount.toString(),
      currency: draft.currency,
      description: draft.description.trim(),
      payerId: draft.payerId,
      participants: draft.participants.map((participant) => ({
        userId: participant.userId,
        shareMinor: nonNegativeMinor(participant.shareMinor, 'Phần chia').toString(),
      })),
      categoryId: draft.categoryId ?? 'other',
      ...(draft.groupId ? { groupId: draft.groupId } : {}),
      ...(draft.friendId ? { friendId: draft.friendId } : {}),
    },
  };
}

export function createOfflineExpenseDeleteOperation(input: {
  operationId: string;
  createdAt: string;
  expense: {
    id: string;
    version: number;
    ownerId: string;
    payerId: string;
    amountMinor: string;
    currency: SupportedCurrency;
    description: string;
    categoryId: string | null;
    friendId: string | null;
    groupId: string | null;
    participants: Array<{ userId: string; shareMinor: string }>;
  };
}): SyncOperation {
  if (!Number.isSafeInteger(input.expense.version) || input.expense.version < 1)
    throw new Error('Không thể xóa khoản chi chưa được đồng bộ lên máy chủ.');
  return {
    id: input.operationId,
    entity: 'expense',
    entityId: input.expense.id,
    expectedVersion: input.expense.version,
    createdAt: input.createdAt,
    payload: {
      action: 'delete',
      expenseId: input.expense.id,
      amountMinor: input.expense.amountMinor,
      currency: input.expense.currency,
      description: input.expense.description,
      payerId: input.expense.payerId,
      participants: input.expense.participants,
      categoryId: input.expense.categoryId,
      friendId: input.expense.friendId,
      groupId: input.expense.groupId,
      expectedVersion: input.expense.version,
      ownerId: input.expense.ownerId,
      state: 'DELETED',
      version: input.expense.version + 1,
    },
  };
}

export function createOfflineOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const chars = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return chars.replace(/[xy]/g, (slot) => {
    const random = Math.floor(Math.random() * 16);
    return (slot === 'x' ? random : (random & 3) | 8).toString(16);
  });
}

function positiveMinor(value: string, field: string): bigint {
  if (!/^\d{1,30}$/.test(value) || BigInt(value) <= 0n)
    throw new Error(`${field} phải là số nguyên dương theo đơn vị nhỏ nhất.`);
  return BigInt(value);
}

function nonNegativeMinor(value: string, field: string): bigint {
  if (!/^\d{1,30}$/.test(value))
    throw new Error(`${field} phải là số nguyên không âm theo đơn vị nhỏ nhất.`);
  return BigInt(value);
}
