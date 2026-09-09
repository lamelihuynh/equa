import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

import { SUPPORTED_CURRENCIES } from '@equa/contracts';

import { LedgerError } from './errors.js';
import type { LedgerSocialAdapter } from './social-adapter.js';
import {
  InMemoryExpenseRepository,
  type ExpenseMutation,
  type ExpenseRepository,
} from './expense.repository.js';
import {
  STANDARD_CATEGORIES,
  type Category,
  type Expense,
  type ExpenseFilters,
  type ExpenseHistory,
  type ExpenseParticipant,
  type ExpenseTotal,
  type LedgerOutboxEvent,
  type PairBalance,
} from './types.js';

export interface AuthenticatedLedgerUser {
  id: string;
  email: string;
}
export interface CreateExpenseInput {
  amountMinor: string | number;
  currency: string;
  description?: string;
  payerId: string;
  /** Internal sync may supply the server expense id; public create ignores it. */
  id?: string;
  participants?: Array<{ userId: string; shareMinor: string | number }>;
  categoryId?: string;
  friendId?: string;
  groupId?: string;
  tripId?: string;
  /** Sync create operations must start from an empty server version. */
  expectedVersion?: number;
}
export interface UpdateExpenseInput {
  amountMinor?: string | number;
  currency?: string;
  description?: string;
  participants?: Array<{ userId: string; shareMinor: string | number }>;
  categoryId?: string | null;
  /** Supplied by offline sync to prevent overwriting a newer server version. */
  expectedVersion?: number;
}

export class ExpenseService {
  readonly repository: ExpenseRepository;
  private readonly recalculation = new Map<string, number>();
  private readonly locks = new Map<string, Promise<void>>();
  constructor(
    repository: ExpenseRepository = new InMemoryExpenseRepository(),
    private readonly social: LedgerSocialAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
  }

  async create(
    actor: AuthenticatedLedgerUser,
    input: CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<Expense> {
    return this.withLock(`create:${actor.id}:${idempotencyKey}`, () =>
      this.createUnlocked(actor, input, idempotencyKey),
    );
  }

  private async createUnlocked(
    actor: AuthenticatedLedgerUser,
    input: CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<Expense> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new LedgerError('INVALID_INPUT', 'Expense payload is invalid.');
    const key = requiredKey(idempotencyKey);
    const requestHash = hash({ operation: 'create', actor: actor.id, input });
    const previous = await this.repository.findIdempotency(actor.id, key);
    if (previous)
      return this.replay<Expense>(
        previous,
        requestHash,
        'Expense creation idempotency key was reused with another payload.',
      );
    assertCreateExpectedVersion(input.expectedVersion);
    const amountMinor = parseMinor(input.amountMinor, 'amountMinor');
    const currency = parseCurrency(input.currency);
    assertIdentifier(input.payerId, 'payerId');
    assertOptionalIdentifier(input.friendId, 'friendId');
    assertOptionalIdentifier(input.groupId, 'groupId');
    assertOptionalIdentifier(input.tripId, 'tripId');
    await this.authorizeAssociation(actor.id, input.payerId, input.friendId, input.groupId);
    const participants = parseParticipants(input.participants, amountMinor, input.payerId);
    await this.authorizeParticipants(
      actor.id,
      input.payerId,
      input.friendId,
      input.groupId,
      participants,
    );
    const category = await this.categoryFor(actor.id, input.categoryId);
    const timestamp = this.now().toISOString();
    if (input.id !== undefined) assertIdentifier(input.id, 'id');
    const expense: Expense = {
      id: input.id ?? randomUUID(),
      ownerId: actor.id,
      payerId: input.payerId,
      amountMinor: amountMinor.toString(),
      currency,
      description: normalizedDescription(input.description),
      categoryId: category?.id ?? null,
      categoryKind: category ? (category.standard ? 'standard' : 'custom') : null,
      friendId: input.friendId ?? null,
      groupId: input.groupId ?? null,
      tripId: input.tripId ?? null,
      participants,
      state: 'ACTIVE',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const duplicate = await this.commitMutation({
      operation: 'create',
      expense,
      history: this.historyEntry(expense, actor.id),
      scope: actor.id,
      key,
      hash: requestHash,
      event: this.eventFor('create', expense, actor.id, key),
    });
    if (duplicate) return duplicate;
    this.recalculate(expense);
    return structuredClone(expense);
  }

  async update(
    actor: AuthenticatedLedgerUser,
    id: string,
    input: UpdateExpenseInput,
    idempotencyKey: string,
  ): Promise<Expense> {
    return this.withLock(`update:${actor.id}:${idempotencyKey}`, () =>
      this.updateUnlocked(actor, id, input, idempotencyKey),
    );
  }

  private async updateUnlocked(
    actor: AuthenticatedLedgerUser,
    id: string,
    input: UpdateExpenseInput,
    idempotencyKey: string,
  ): Promise<Expense> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new LedgerError('INVALID_INPUT', 'Expense payload is invalid.');
    assertIdentifier(id, 'id');
    const key = requiredKey(idempotencyKey);
    const requestHash = hash({ operation: 'update', actor: actor.id, id, input });
    const previous = await this.repository.findIdempotency(actor.id, key);
    if (previous)
      return this.replay<Expense>(
        previous,
        requestHash,
        'Expense update idempotency key was reused with another payload.',
      );
    const expense = await this.require(id);
    this.authorizeUpdate(actor.id, expense);
    if (expense.state === 'DELETED')
      throw new LedgerError('EXPENSE_DELETED', 'Deleted expenses cannot be updated.', 409);
    assertExpectedVersion(input.expectedVersion, expense.version);
    const previousVersion = expense.version;
    if (input.amountMinor !== undefined) {
      const amountMinor = parseMinor(input.amountMinor, 'amountMinor');
      expense.amountMinor = amountMinor.toString();
      if (input.participants === undefined) {
        if (expense.participants.length !== 1)
          throw new LedgerError(
            'PARTICIPANTS_REQUIRED',
            'Explicit participant shares are required when a multi-participant expense amount changes.',
          );
        expense.participants = [
          { userId: expense.participants[0]!.userId, shareMinor: amountMinor.toString() },
        ];
      }
    }
    if (input.currency !== undefined) expense.currency = parseCurrency(input.currency);
    if (input.description !== undefined) {
      if (typeof input.description !== 'string')
        throw new LedgerError('INVALID_INPUT', 'description must be a string.');
      expense.description = input.description.trim();
    }
    if (input.participants !== undefined) {
      const amount = BigInt(expense.amountMinor);
      expense.participants = parseParticipants(input.participants, amount, expense.payerId);
      await this.authorizeParticipants(
        actor.id,
        expense.payerId,
        expense.friendId ?? undefined,
        expense.groupId ?? undefined,
        expense.participants,
      );
    }
    const category = await this.categoryFor(
      actor.id,
      input.categoryId === null ? undefined : input.categoryId,
    );
    if (input.categoryId !== undefined) {
      expense.categoryId = category?.id ?? null;
      expense.categoryKind = category ? (category.standard ? 'standard' : 'custom') : null;
    }
    expense.state = 'UPDATED';
    expense.version += 1;
    expense.updatedAt = this.now().toISOString();
    const duplicate = await this.commitMutation({
      operation: 'update',
      expense,
      history: this.historyEntry(expense, actor.id),
      scope: actor.id,
      key,
      hash: requestHash,
      expectedVersion: previousVersion,
      event: this.eventFor('update', expense, actor.id, key),
    });
    if (duplicate) return duplicate;
    this.recalculate(expense);
    return structuredClone(expense);
  }

  async remove(
    actor: AuthenticatedLedgerUser,
    id: string,
    idempotencyKey: string,
    expectedVersion?: number,
  ): Promise<Expense> {
    return this.withLock(`delete:${actor.id}:${idempotencyKey}`, () =>
      this.removeUnlocked(actor, id, idempotencyKey, expectedVersion),
    );
  }

  private async removeUnlocked(
    actor: AuthenticatedLedgerUser,
    id: string,
    idempotencyKey: string,
    expectedVersion?: number,
  ): Promise<Expense> {
    const key = requiredKey(idempotencyKey);
    assertIdentifier(id, 'id');
    const requestHash = hash({ operation: 'delete', actor: actor.id, id, expectedVersion });
    const previous = await this.repository.findIdempotency(actor.id, key);
    if (previous)
      return this.replay<Expense>(
        previous,
        requestHash,
        'Expense delete idempotency key was reused with another payload.',
      );
    const expense = await this.require(id);
    if (expense.payerId !== actor.id) {
      if (!expense.groupId || !(await this.safeGroupAdmin(expense.groupId, actor.id)))
        throw new LedgerError(
          'EXPENSE_DELETE_FORBIDDEN',
          'Only the payer or group admin may delete this expense.',
          403,
        );
    }
    assertExpectedVersion(expectedVersion, expense.version);
    if (expense.state !== 'DELETED') {
      const previousVersion = expense.version;
      expense.state = 'DELETED';
      expense.version += 1;
      expense.updatedAt = this.now().toISOString();
      const duplicate = await this.commitMutation({
        operation: 'delete',
        expense,
        history: this.historyEntry(expense, actor.id),
        scope: actor.id,
        key,
        hash: requestHash,
        expectedVersion: previousVersion,
        event: this.eventFor('delete', expense, actor.id, key),
      });
      if (duplicate) return duplicate;
      this.recalculate(expense);
    } else {
      // A new key against an already deleted expense is a safe no-op, but it
      // still gets a receipt so a retry does not look like a missing request.
      await this.repository.saveIdempotency(actor.id, key, requestHash, expense);
    }
    return structuredClone(expense);
  }

  async get(actor: AuthenticatedLedgerUser, id: string): Promise<Expense> {
    assertIdentifier(id, 'id');
    const expense = await this.require(id);
    await this.authorizeAccess(actor.id, expense);
    return structuredClone(expense);
  }
  async history(actor: AuthenticatedLedgerUser, id: string): Promise<ExpenseHistory[]> {
    assertIdentifier(id, 'id');
    const expense = await this.require(id);
    await this.authorizeAccess(actor.id, expense);
    return this.repository.listHistory(id);
  }

  async total(actor: AuthenticatedLedgerUser, filters: ExpenseFilters): Promise<ExpenseTotal> {
    validateFilters(filters);
    if (filters.userId && filters.userId !== actor.id)
      throw new LedgerError(
        'TOTAL_FORBIDDEN',
        'User totals may only be requested for the authenticated user.',
        403,
      );
    if (filters.friendId && !(await this.safeFriend(actor.id, filters.friendId)))
      throw new LedgerError('FRIEND_FORBIDDEN', 'Friend access is unavailable.', 403);
    if (filters.groupId && !(await this.safeMember(filters.groupId, actor.id)))
      throw new LedgerError('GROUP_FORBIDDEN', 'Group membership is required.', 403);
    const expenses = await this.repository.listExpenses();
    const totals = new Map<string, { totalMinor: bigint; count: number }>();
    for (const expense of expenses) {
      if (expense.state === 'DELETED' || !this.matches(expense, filters)) continue;
      if (!(await this.canRead(actor.id, expense))) continue;
      const current = totals.get(expense.currency) ?? { totalMinor: 0n, count: 0 };
      current.totalMinor += BigInt(expense.amountMinor);
      current.count += 1;
      totals.set(expense.currency, current);
    }
    const rows = [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, value]) => ({
        currency,
        totalMinor: value.totalMinor.toString(),
        count: value.count,
      }));
    return {
      totalMinor: rows.length === 1 ? rows[0]!.totalMinor : rows.length === 0 ? '0' : null,
      currency: rows.length === 1 ? rows[0]!.currency : null,
      count: rows.reduce((sum, row) => sum + row.count, 0),
      totals: rows,
    };
  }

  async createCategory(actor: AuthenticatedLedgerUser, name: string): Promise<Category> {
    if (typeof name !== 'string')
      throw new LedgerError('INVALID_CATEGORY', 'Category name is required.');
    const normalized = name.trim();
    if (!normalized) throw new LedgerError('INVALID_CATEGORY', 'Category name is required.');
    const category: Category = {
      id: randomUUID(),
      ownerId: actor.id,
      name: normalized,
      standard: false,
      createdAt: this.now().toISOString(),
    };
    await this.repository.createCategory(category);
    return category;
  }
  async categories(actor: AuthenticatedLedgerUser): Promise<Category[]> {
    const custom = await this.repository.listCategories(actor.id);
    const standard: Category[] = STANDARD_CATEGORIES.map((id) => ({
      id,
      ownerId: 'system',
      name: id,
      standard: true,
      createdAt: '1970-01-01T00:00:00.000Z',
    }));
    return [...standard, ...custom.filter((category) => !category.standard)];
  }

  async pairBalance(userId: string, counterpartyId: string): Promise<PairBalance> {
    if (this.repository.readPairBalance)
      return this.repository.readPairBalance(userId, counterpartyId);
    const byCurrency = new Map<string, bigint>();
    for (const expense of await this.repository.listExpenses()) {
      if (expense.state === 'DELETED') continue;
      for (const participant of expense.participants) {
        if (participant.userId === expense.payerId) continue;
        let delta = 0n;
        if (expense.payerId === userId && participant.userId === counterpartyId)
          delta += BigInt(participant.shareMinor);
        if (expense.payerId === counterpartyId && participant.userId === userId)
          delta -= BigInt(participant.shareMinor);
        if (delta !== 0n)
          byCurrency.set(expense.currency, (byCurrency.get(expense.currency) ?? 0n) + delta);
      }
    }
    return pairBalanceResult(userId, counterpartyId, byCurrency);
  }
  async hasOutstandingDebt(userId: string, counterpartyId: string): Promise<boolean> {
    return (await this.pairBalance(userId, counterpartyId)).hasOutstandingDebt;
  }
  async hasOutstandingGroupDebt(groupId: string, userId: string): Promise<boolean> {
    if (this.repository.readGroupDebt) return this.repository.readGroupDebt(groupId, userId);
    const balances = new Map<string, bigint>();
    for (const expense of await this.repository.listExpenses()) {
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
    return [...balances.values()].some((value) => value !== 0n);
  }
  /**
   * Legacy diagnostic retained for old callers. Balance correctness is proved
   * by pairBalance/hasOutstandingGroupDebt and the owning repository
   * projection, never by this counter.
   */
  recalculationCount(expenseId: string): number {
    return this.recalculation.get(expenseId) ?? 0;
  }

  async feed(
    ownerId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ cursor?: string; events: LedgerOutboxEvent[] }> {
    if (!this.repository.readFeed)
      throw new LedgerError('FEED_UNAVAILABLE', 'Ledger feed is unavailable.', 503);
    try {
      return await this.repository.readFeed(ownerId, cursor, limit);
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw new LedgerError(
        'INVALID_CURSOR',
        error instanceof Error ? error.message : 'Ledger feed cursor is invalid.',
        400,
      );
    }
  }

  private async authorizeAssociation(
    userId: string,
    payerId: string,
    friendId?: string,
    groupId?: string,
  ): Promise<void> {
    if (friendId && groupId)
      throw new LedgerError(
        'INVALID_ASSOCIATION',
        'An expense may target a friend or a group, not both.',
      );
    if (friendId) {
      if (friendId === userId)
        throw new LedgerError(
          'INVALID_ASSOCIATION',
          'The friend association must name another user.',
        );
      if (!(await this.safeFriend(userId, friendId)))
        throw new LedgerError('FRIEND_FORBIDDEN', 'A valid friendship is required.', 403);
      if (payerId !== userId && payerId !== friendId)
        throw new LedgerError(
          'PAYER_FORBIDDEN',
          'The payer must be the actor or the associated friend.',
          403,
        );
    }
    if (groupId && !(await this.safeMember(groupId, userId)))
      throw new LedgerError('GROUP_FORBIDDEN', 'A valid group membership is required.', 403);
    if (groupId && !(await this.safeMember(groupId, payerId)))
      throw new LedgerError('PAYER_FORBIDDEN', 'The payer must be a group member.', 403);
    if (!friendId && !groupId && payerId !== userId)
      throw new LedgerError(
        'PAYER_FORBIDDEN',
        'A different payer requires an associated friend or group.',
        403,
      );
  }
  private async authorizeParticipants(
    actorId: string,
    payerId: string,
    friendId: string | undefined,
    groupId: string | undefined,
    participants: ExpenseParticipant[],
  ): Promise<void> {
    if (groupId)
      for (const participant of participants)
        if (!(await this.safeMember(groupId, participant.userId)))
          throw new LedgerError(
            'GROUP_MEMBER_REQUIRED',
            'Every participant must be a group member.',
            403,
          );
    if (friendId)
      for (const participant of participants)
        if (participant.userId !== actorId && participant.userId !== friendId)
          throw new LedgerError(
            'FRIEND_MEMBER_REQUIRED',
            'Friend expenses may only include the two associated users.',
            403,
          );
    if (!groupId && !friendId)
      for (const participant of participants)
        if (participant.userId !== actorId && participant.userId !== payerId)
          throw new LedgerError(
            'PARTICIPANT_FORBIDDEN',
            'Participants must be associated with the expense context.',
            403,
          );
  }
  private async authorizeAccess(userId: string, expense: Expense): Promise<void> {
    if (!(await this.canRead(userId, expense)))
      throw new LedgerError(
        'EXPENSE_FORBIDDEN',
        'You are not allowed to access this expense.',
        403,
      );
  }
  private authorizeUpdate(userId: string, expense: Expense): void {
    if (
      expense.ownerId === userId ||
      expense.payerId === userId ||
      expense.participants.some((item) => item.userId === userId)
    )
      return;
    throw new LedgerError(
      'EXPENSE_UPDATE_FORBIDDEN',
      'Only the payer or a participant may update this expense.',
      403,
    );
  }
  private async canRead(userId: string, expense: Expense): Promise<boolean> {
    if (expense.groupId) return this.safeMember(expense.groupId, userId);
    if (
      expense.ownerId === userId ||
      expense.payerId === userId ||
      expense.participants.some((participant) => participant.userId === userId)
    )
      return true;
    if (expense.friendId === userId) return this.safeFriend(expense.payerId, userId);
    return false;
  }
  private async safeMember(groupId: string, userId: string): Promise<boolean> {
    try {
      return await this.social.isGroupMember(groupId, userId);
    } catch {
      throw new LedgerError('SOCIAL_UNAVAILABLE', 'Social membership service is unavailable.', 503);
    }
  }
  private async safeGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      return await this.social.isGroupAdmin(groupId, userId);
    } catch {
      throw new LedgerError('SOCIAL_UNAVAILABLE', 'Social membership service is unavailable.', 503);
    }
  }
  private async safeFriend(userId: string, friendId: string): Promise<boolean> {
    try {
      return await this.social.isFriend(userId, friendId);
    } catch {
      throw new LedgerError('SOCIAL_UNAVAILABLE', 'Social membership service is unavailable.', 503);
    }
  }
  private async categoryFor(ownerId: string, id?: string): Promise<Category | undefined> {
    if (id === undefined) return undefined;
    if (typeof id !== 'string')
      throw new LedgerError('INVALID_CATEGORY', 'categoryId must be a string.');
    if (!id.trim()) throw new LedgerError('INVALID_CATEGORY', 'categoryId must be a string.');
    if (STANDARD_CATEGORIES.includes(id as (typeof STANDARD_CATEGORIES)[number]))
      return {
        id,
        ownerId: 'system',
        name: id,
        standard: true,
        createdAt: '1970-01-01T00:00:00.000Z',
      };
    const category = await this.repository.findCategory(id);
    if (!category || category.standard || category.ownerId !== ownerId)
      throw new LedgerError('CATEGORY_FORBIDDEN', 'Custom category is unavailable.', 403);
    return category;
  }
  private matches(expense: Expense, filters: ExpenseFilters): boolean {
    return (
      (!filters.userId ||
        expense.payerId === filters.userId ||
        expense.participants.some((item) => item.userId === filters.userId)) &&
      (!filters.friendId || expense.friendId === filters.friendId) &&
      (!filters.groupId || expense.groupId === filters.groupId) &&
      (!filters.tripId || expense.tripId === filters.tripId) &&
      (!filters.from || expense.createdAt >= filters.from) &&
      (!filters.to || expense.createdAt <= filters.to)
    );
  }
  private async require(id: string): Promise<Expense> {
    const expense = await this.repository.findExpense(id);
    if (!expense) throw new LedgerError('EXPENSE_NOT_FOUND', 'Expense was not found.', 404);
    return expense;
  }
  private historyEntry(expense: Expense, changedBy: string): ExpenseHistory {
    return {
      id: randomUUID(),
      expenseId: expense.id,
      state: expense.state,
      version: expense.version,
      snapshot: structuredClone(expense),
      changedBy,
      changedAt: expense.updatedAt,
    };
  }
  private recalculate(expense: Expense): void {
    this.recalculation.set(expense.id, (this.recalculation.get(expense.id) ?? 0) + 1);
  }

  private eventFor(
    operation: ExpenseMutation['operation'],
    expense: Expense,
    actorId: string,
    idempotencyKey: string,
  ): LedgerOutboxEvent {
    return {
      id: randomUUID(),
      version: 1,
      type: `expense.${operation === 'delete' ? 'deleted' : operation === 'create' ? 'created' : 'updated'}`,
      occurredAt: expense.updatedAt,
      ownerId: expense.ownerId,
      correlationId: hash({ actorId, idempotencyKey }),
      producer: 'ledger',
      payload: {
        expenseId: expense.id,
        version: expense.version,
        ownerId: expense.ownerId,
        actorId,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        description: expense.description,
        payerId: expense.payerId,
        participants: structuredClone(expense.participants),
        categoryId: expense.categoryId,
        friendId: expense.friendId,
        groupId: expense.groupId,
        tripId: expense.tripId,
        state: expense.state,
      },
    };
  }

  private async commitMutation(mutation: ExpenseMutation): Promise<Expense | undefined> {
    if (this.repository.persistMutation) {
      const result = await this.repository.persistMutation(mutation);
      if (result.status === 'mismatch')
        throw new LedgerError(
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency key was reused with another payload.',
          409,
        );
      if (result.status === 'conflict')
        throw new LedgerError(
          'CONFLICT',
          'The expense id or version conflicts with an existing record.',
          409,
        );
      if (result.status === 'duplicate') return structuredClone(result.response as Expense);
      return undefined;
    }
    if (mutation.operation === 'create') await this.repository.createExpense(mutation.expense);
    else await this.repository.saveExpense(mutation.expense);
    await this.repository.addHistory(mutation.history);
    await this.repository.saveIdempotency(
      mutation.scope,
      mutation.key,
      mutation.hash,
      mutation.expense,
    );
    return undefined;
  }

  private replay<T>(
    previous: { hash: string; response: unknown },
    hashValue: string,
    message: string,
  ): T {
    if (previous.hash !== hashValue) throw new LedgerError('IDEMPOTENCY_KEY_REUSED', message, 409);
    return structuredClone(previous.response) as T;
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}

function requiredKey(value: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new LedgerError('IDEMPOTENCY_REQUIRED', 'Idempotency-Key is required.', 400);
  return value.trim();
}
function assertExpectedVersion(expectedVersion: number | undefined, actualVersion: number): void {
  if (expectedVersion === undefined) return;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new LedgerError('INVALID_EXPECTED_VERSION', 'expectedVersion must be a safe integer.');
  if (expectedVersion !== actualVersion)
    throw new LedgerError('CONFLICT', 'Expense version no longer matches the client version.', 409);
}
function assertCreateExpectedVersion(expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) return;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new LedgerError('INVALID_EXPECTED_VERSION', 'expectedVersion must be a safe integer.');
  if (expectedVersion !== 0)
    throw new LedgerError('CONFLICT', 'A new expense must start at version zero.', 409);
}
function parseCurrency(value: string): string {
  if (
    typeof value !== 'string' ||
    !SUPPORTED_CURRENCIES.includes(value as (typeof SUPPORTED_CURRENCIES)[number])
  )
    throw new LedgerError('INVALID_CURRENCY', 'Currency must be an ISO 4217 code.', 400);
  return value;
}
function normalizedDescription(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string')
    throw new LedgerError('INVALID_INPUT', 'description must be a string.');
  return value.trim();
}
function parseMinor(value: string | number, field: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new LedgerError(
        'INVALID_AMOUNT',
        `${field} must be a positive safe integer minor-unit value.`,
      );
    return BigInt(value);
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 30 || BigInt(value) <= 0n)
    throw new LedgerError(
      'INVALID_AMOUNT',
      `${field} must be a positive integer minor-unit string.`,
    );
  return BigInt(value);
}
function parseParticipants(
  input: CreateExpenseInput['participants'],
  amount: bigint,
  payerId: string,
): ExpenseParticipant[] {
  if (input !== undefined && !Array.isArray(input))
    throw new LedgerError('INVALID_PARTICIPANTS', 'Participants must be an array.');
  const values = input?.length ? input : [{ userId: payerId, shareMinor: amount.toString() }];
  const ids = new Set<string>();
  let total = 0n;
  const participants = values.map((item) => {
    if (!isParticipantInput(item) || ids.has(item.userId))
      throw new LedgerError('INVALID_PARTICIPANTS', 'Participants must be unique.');
    ids.add(item.userId);
    const share = parseNonNegativeMinor(item.shareMinor);
    total += share;
    return { userId: item.userId, shareMinor: share.toString() };
  });
  if (total !== amount)
    throw new LedgerError(
      'PARTICIPANT_SUM_MISMATCH',
      'Participant shares must equal the expense amount.',
    );
  return participants;
}
function parseNonNegativeMinor(value: string | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new LedgerError(
        'INVALID_PARTICIPANTS',
        'Participant shares must be safe integer minor units.',
      );
    return BigInt(value);
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 30)
    throw new LedgerError(
      'INVALID_PARTICIPANTS',
      'Participant shares must be integer minor-unit strings.',
    );
  return BigInt(value);
}
function assertIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new LedgerError('INVALID_INPUT', `${field} must be a non-empty identifier.`);
}
function assertOptionalIdentifier(value: unknown, field: string): void {
  if (value !== undefined && value !== null) assertIdentifier(value, field);
}
function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isParticipantInput(
  value: unknown,
): value is { userId: string; shareMinor: string | number } {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    value.userId.trim().length > 0 &&
    (typeof value.shareMinor === 'string' || typeof value.shareMinor === 'number')
  );
}

function validateFilters(filters: ExpenseFilters): void {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters))
    throw new LedgerError('INVALID_FILTER', 'Expense filters are invalid.');
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && typeof value !== 'string')
      throw new LedgerError('INVALID_FILTER', `${field} must be a string.`);
  }
  for (const field of ['from', 'to'] as const) {
    const value = filters[field];
    if (value !== undefined && Number.isNaN(Date.parse(value)))
      throw new LedgerError('INVALID_DATE', `${field} must be an ISO date.`);
  }
  if (filters.from && filters.to && Date.parse(filters.from) > Date.parse(filters.to))
    throw new LedgerError('INVALID_DATE', 'from must be before or equal to to.');
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
