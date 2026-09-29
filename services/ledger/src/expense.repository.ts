import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { Category, Expense, ExpenseHistory, LedgerOutboxEvent, PairBalance } from './types.js';

export interface ExpenseMutation {
  operation: 'create' | 'update' | 'delete';
  expense: Expense;
  history: ExpenseHistory;
  scope: string;
  key: string;
  hash: string;
  /** Version expected in storage before an update/delete. */
  expectedVersion?: number;
  event: LedgerOutboxEvent;
}

export interface MutationResult {
  status: 'inserted' | 'duplicate' | 'mismatch' | 'conflict';
  response?: unknown;
}

export interface ExpenseRepository {
  findExpense(id: string): Promise<Expense | undefined>;
  saveExpense(expense: Expense): Promise<void>;
  createExpense(expense: Expense): Promise<void>;
  listExpenses(): Promise<Expense[]>;
  addHistory(history: ExpenseHistory): Promise<void>;
  listHistory(expenseId: string): Promise<ExpenseHistory[]>;
  findIdempotency(
    scope: string,
    key: string,
  ): Promise<{ hash: string; response: unknown } | undefined>;
  saveIdempotency(scope: string, key: string, hash: string, response: unknown): Promise<void>;
  createCategory(category: Category): Promise<void>;
  findCategory(id: string): Promise<Category | undefined>;
  listCategories(ownerId: string): Promise<Category[]>;
  /** Implementations backed by a database should commit the complete mutation atomically. */
  persistMutation?(mutation: ExpenseMutation): Promise<MutationResult>;
  readPairBalance?(userId: string, counterpartyId: string): Promise<PairBalance>;
  readGroupDebt?(groupId: string, userId: string): Promise<boolean>;
  readFeed?(
    ownerId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{
    cursor?: string;
    events: LedgerOutboxEvent[];
  }>;
}

export class InMemoryExpenseRepository implements ExpenseRepository {
  readonly expenses = new Map<string, Expense>();
  readonly histories = new Map<string, ExpenseHistory[]>();
  readonly idempotency = new Map<string, { hash: string; response: unknown }>();
  readonly categories = new Map<string, Category>();
  readonly outbox: LedgerOutboxEvent[] = [];
  private readonly outboxState = new Map<
    string,
    {
      attempts: number;
      availableAt: Date;
      leaseUntil?: Date;
      leaseToken?: string;
      status: 'pending' | 'leased' | 'published' | 'dead';
    }
  >();
  private readonly feedSecret: string;
  constructor(
    feedSecret = process.env.LEDGER_FEED_CURSOR_SECRET ??
      process.env.LEDGER_SERVICE_KEY ??
      process.env.AUTOMATION_SYNC_SERVICE_KEY ??
      'in-memory-ledger-feed-secret',
  ) {
    this.feedSecret = feedSecret;
  }
  findExpense(id: string): Promise<Expense | undefined> {
    return Promise.resolve(clone(this.expenses.get(id)));
  }
  saveExpense(expense: Expense): Promise<void> {
    this.expenses.set(expense.id, structuredClone(expense));
    return Promise.resolve();
  }
  createExpense(expense: Expense): Promise<void> {
    this.expenses.set(expense.id, structuredClone(expense));
    return Promise.resolve();
  }
  listExpenses(): Promise<Expense[]> {
    return Promise.resolve([...this.expenses.values()].map((item) => structuredClone(item)));
  }
  addHistory(history: ExpenseHistory): Promise<void> {
    const current = this.histories.get(history.expenseId) ?? [];
    current.push(structuredClone(history));
    this.histories.set(history.expenseId, current);
    return Promise.resolve();
  }
  listHistory(expenseId: string): Promise<ExpenseHistory[]> {
    return Promise.resolve(
      (this.histories.get(expenseId) ?? []).map((item) => structuredClone(item)),
    );
  }
  findIdempotency(
    scope: string,
    key: string,
  ): Promise<{ hash: string; response: unknown } | undefined> {
    return Promise.resolve(clone(this.idempotency.get(`${scope}\u0000${key}`)));
  }
  saveIdempotency(scope: string, key: string, hash: string, response: unknown): Promise<void> {
    this.idempotency.set(`${scope}\u0000${key}`, { hash, response: structuredClone(response) });
    return Promise.resolve();
  }
  createCategory(category: Category): Promise<void> {
    this.categories.set(category.id, structuredClone(category));
    return Promise.resolve();
  }
  findCategory(id: string): Promise<Category | undefined> {
    return Promise.resolve(clone(this.categories.get(id)));
  }
  listCategories(ownerId: string): Promise<Category[]> {
    return Promise.resolve(
      [...this.categories.values()]
        .filter((item) => item.standard || item.ownerId === ownerId)
        .map((item) => structuredClone(item)),
    );
  }

  persistMutation(mutation: ExpenseMutation): Promise<MutationResult> {
    const existing = this.idempotency.get(`${mutation.scope}\u0000${mutation.key}`);
    if (existing)
      return Promise.resolve(
        existing.hash === mutation.hash
          ? { status: 'duplicate', response: structuredClone(existing.response) }
          : { status: 'mismatch' },
      );
    if (mutation.operation === 'create' && this.expenses.has(mutation.expense.id))
      return Promise.resolve({ status: 'conflict' });
    const storedExpense = this.expenses.get(mutation.expense.id);
    if (mutation.operation !== 'create') {
      if (!storedExpense) return Promise.resolve({ status: 'conflict' });
      if (
        mutation.expectedVersion !== undefined &&
        storedExpense.version !== mutation.expectedVersion
      )
        return Promise.resolve({ status: 'conflict' });
    }
    this.expenses.set(mutation.expense.id, structuredClone(mutation.expense));
    const current = this.histories.get(mutation.history.expenseId) ?? [];
    current.push(structuredClone(mutation.history));
    this.histories.set(mutation.history.expenseId, current);
    this.idempotency.set(`${mutation.scope}\u0000${mutation.key}`, {
      hash: mutation.hash,
      response: structuredClone(mutation.expense),
    });
    this.outbox.push(structuredClone(mutation.event));
    this.outboxState.set(mutation.event.id, {
      attempts: 0,
      availableAt: new Date(0),
      status: 'pending',
    });
    return Promise.resolve({ status: 'inserted' });
  }

  claimOutbox(now: Date): Promise<
    | {
        event: LedgerOutboxEvent;
        leaseToken: string;
        attempts: number;
      }
    | undefined
  > {
    for (const state of this.outboxState.values()) {
      if (state.attempts >= 8 && state.status !== 'published') state.status = 'dead';
    }
    const event = this.outbox.find((candidate) => {
      const state = this.outboxState.get(candidate.id);
      return Boolean(
        state &&
        state.status !== 'published' &&
        state.status !== 'dead' &&
        state.availableAt <= now &&
        (!state.leaseUntil || state.leaseUntil <= now),
      );
    });
    if (!event) return Promise.resolve(undefined);
    const state = this.outboxState.get(event.id)!;
    state.status = 'leased';
    state.attempts += 1;
    state.leaseUntil = new Date(now.valueOf() + 30_000);
    state.leaseToken = randomUUID();
    return Promise.resolve({
      event: structuredClone(event),
      leaseToken: state.leaseToken,
      attempts: state.attempts,
    });
  }

  completeOutbox(id: string, leaseToken: string): Promise<void> {
    const state = this.outboxState.get(id);
    if (state?.status === 'leased' && state.leaseToken === leaseToken) {
      state.status = 'published';
      state.leaseUntil = undefined;
      state.leaseToken = undefined;
    }
    return Promise.resolve();
  }

  retryOutbox(
    id: string,
    leaseToken: string,
    _error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    void _error;
    const state = this.outboxState.get(id);
    if (state?.status === 'leased' && state.leaseToken === leaseToken) {
      state.status = terminal ? 'dead' : 'pending';
      state.availableAt = retryAt;
      state.leaseUntil = undefined;
      state.leaseToken = undefined;
    }
    return Promise.resolve();
  }

  async readPairBalance(userId: string, counterpartyId: string): Promise<PairBalance> {
    const byCurrency = calculatePairBalances(await this.listExpenses(), userId, counterpartyId);
    return pairBalanceResult(userId, counterpartyId, byCurrency);
  }

  readGroupDebt(groupId: string, userId: string): Promise<boolean> {
    const balances = new Map<string, bigint>();
    for (const expense of this.expenses.values()) {
      if (expense.state === 'DELETED' || expense.groupId !== groupId) continue;
      for (const participant of expense.participants) {
        if (participant.userId === expense.payerId) continue;
        const share = BigInt(participant.shareMinor);
        if (expense.payerId === userId)
          balances.set(expense.currency, (balances.get(expense.currency) ?? 0n) + share);
        if (participant.userId === userId)
          balances.set(expense.currency, (balances.get(expense.currency) ?? 0n) - share);
      }
    }
    return Promise.resolve([...balances.values()].some((value) => value !== 0n));
  }

  readFeed(
    ownerId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ cursor?: string; events: LedgerOutboxEvent[] }> {
    const start = decodeCursor(cursor, ownerId, this.feedSecret);
    const owned = this.outbox.filter((event) => event.ownerId === ownerId);
    const page = owned.slice(start, start + Math.max(1, Math.min(limit, 100)));
    const next = start + page.length;
    return Promise.resolve({
      ...(page.length
        ? { cursor: encodeCursor(ownerId, next, this.feedSecret) }
        : cursor
          ? { cursor }
          : {}),
      events: structuredClone(page),
    });
  }
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function calculatePairBalances(
  expenses: Expense[],
  userId: string,
  counterpartyId: string,
): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  for (const expense of expenses) {
    if (expense.state === 'DELETED') continue;
    for (const participant of expense.participants) {
      if (participant.userId === expense.payerId) continue;
      let delta = 0n;
      if (expense.payerId === userId && participant.userId === counterpartyId)
        delta += BigInt(participant.shareMinor);
      if (expense.payerId === counterpartyId && participant.userId === userId)
        delta -= BigInt(participant.shareMinor);
      if (delta !== 0n)
        balances.set(expense.currency, (balances.get(expense.currency) ?? 0n) + delta);
    }
  }
  return balances;
}

function pairBalanceResult(
  userId: string,
  counterpartyId: string,
  byCurrency: Map<string, bigint>,
): PairBalance {
  const balances = [...byCurrency.entries()]
    .filter(([, value]) => value !== 0n)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => ({ currency, netMinor: value.toString() }));
  return {
    userId,
    counterpartyId,
    balances,
    hasOutstandingDebt: balances.some((value) => value.netMinor !== '0'),
    netMinor: balances.length === 1 ? balances[0]!.netMinor : balances.length === 0 ? '0' : null,
    currency: balances.length === 1 ? balances[0]!.currency : null,
  };
}

function encodeCursor(ownerId: string, index: number, secret: string): string {
  const body = Buffer.from(JSON.stringify({ ownerId, index }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function decodeCursor(cursor: string | undefined, ownerId: string, secret: string): number {
  if (!cursor) return 0;
  try {
    const [body, signature] = cursor.split('.');
    if (!body || !signature) throw new Error('invalid');
    const expected = createHmac('sha256', secret).update(body).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw new Error('invalid');
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      ownerId?: unknown;
      index?: unknown;
    };
    if (
      parsed.ownerId !== ownerId ||
      !Number.isSafeInteger(parsed.index) ||
      (parsed.index as number) < 0
    )
      throw new Error('invalid');
    return parsed.index as number;
  } catch {
    throw new Error('Invalid ledger feed cursor.');
  }
}
