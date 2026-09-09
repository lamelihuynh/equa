export const STANDARD_CATEGORIES = [
  'food',
  'transport',
  'accommodation',
  'entertainment',
  'shopping',
  'utilities',
  'other',
] as const;
export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];
export type ExpenseState = 'ACTIVE' | 'UPDATED' | 'DELETED';

export interface ExpenseParticipant {
  userId: string;
  shareMinor: string;
}

export interface Expense {
  id: string;
  ownerId: string;
  payerId: string;
  amountMinor: string;
  currency: string;
  description: string;
  categoryId: string | null;
  categoryKind: 'standard' | 'custom' | null;
  friendId: string | null;
  groupId: string | null;
  tripId: string | null;
  participants: ExpenseParticipant[];
  state: ExpenseState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseHistory {
  id: string;
  expenseId: string;
  state: ExpenseState;
  version: number;
  snapshot: Expense;
  changedBy: string;
  changedAt: string;
}

export interface Category {
  id: string;
  ownerId: string;
  name: string;
  standard: boolean;
  createdAt: string;
}

export interface ExpenseFilters {
  userId?: string;
  friendId?: string;
  groupId?: string;
  tripId?: string;
  from?: string;
  to?: string;
}

export interface ExpenseTotal {
  /** A scalar is present only when the result contains one currency. */
  totalMinor: string | null;
  currency: string | null;
  count: number;
  /** Currency-safe totals for multi-currency queries. */
  totals: Array<{ currency: string; totalMinor: string; count: number }>;
}

export interface PairCurrencyBalance {
  currency: string;
  /** Positive means the counterparty owes userId; negative means userId owes. */
  netMinor: string;
}

export interface PairBalance {
  userId: string;
  counterpartyId: string;
  balances: PairCurrencyBalance[];
  hasOutstandingDebt: boolean;
  /** Backward-compatible scalar fields; null when more than one currency exists. */
  netMinor: string | null;
  currency: string | null;
}

export interface LedgerOutboxEvent {
  id: string;
  version: 1;
  type: 'expense.created' | 'expense.updated' | 'expense.deleted';
  occurredAt: string;
  ownerId: string;
  correlationId: string;
  producer: 'ledger';
  payload: Record<string, unknown> & { expenseId: string; version: number };
}
