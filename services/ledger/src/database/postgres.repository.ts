import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

import { LedgerError } from '../errors.js';
import type { ExpenseMutation, ExpenseRepository, MutationResult } from '../expense.repository.js';
import type {
  Category,
  Expense,
  ExpenseHistory,
  ExpenseParticipant,
  LedgerOutboxEvent,
  PairBalance,
} from '../types.js';

interface ExpenseRow {
  id: string;
  owner_id: string;
  payer_id: string;
  amount_minor: string;
  currency: string;
  description: string;
  category_id: string | null;
  category_kind: 'standard' | 'custom' | null;
  friend_id: string | null;
  group_id: string | null;
  trip_id: string | null;
  state: Expense['state'];
  version: number;
  created_at: Date;
  updated_at: Date;
}
interface ParticipantRow {
  expense_id: string;
  user_id: string;
  share_minor: string;
}
interface HistoryRow {
  id: string;
  expense_id: string;
  state: Expense['state'];
  version: number;
  snapshot: Expense;
  changed_by: string;
  changed_at: Date;
}
interface CategoryRow {
  id: string;
  owner_id: string;
  name: string;
  standard: boolean;
  created_at: Date;
}
interface IdempotencyRow {
  payload_hash: string;
  response: unknown;
}
interface OutboxRow {
  id: string;
  event_version: number;
  event_type: LedgerOutboxEvent['type'];
  occurred_at: Date;
  owner_id: string;
  correlation_id: string;
  producer: 'ledger';
  payload: LedgerOutboxEvent['payload'];
  attempts: number;
  lease_token: string;
  dead_at?: Date | null;
}

export class LedgerDatabase implements ExpenseRepository {
  private readonly pool: Pool;
  private readonly feedSecret: string;
  constructor(connectionString: string, feedSecret = process.env.LEDGER_FEED_CURSOR_SECRET) {
    if (!feedSecret)
      throw new Error('LEDGER_FEED_CURSOR_SECRET must be configured for PostgreSQL Ledger.');
    this.pool = new Pool({ connectionString, max: 10 });
    this.feedSecret = feedSecret;
  }
  close(): Promise<void> {
    return this.pool.end();
  }
  async findExpense(id: string): Promise<Expense | undefined> {
    const result = await this.pool.query<ExpenseRow>('SELECT * FROM expenses WHERE id=$1', [id]);
    return result.rows[0] ? this.withParticipants(result.rows[0]) : undefined;
  }
  async saveExpense(expense: Expense): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE expenses SET payer_id=$2,amount_minor=$3,currency=$4,description=$5,category_id=$6,category_kind=$7,friend_id=$8,group_id=$9,trip_id=$10,state=$11,version=$12,updated_at=$13 WHERE id=$1',
        [
          expense.id,
          expense.payerId,
          expense.amountMinor,
          expense.currency,
          expense.description,
          expense.categoryId,
          expense.categoryKind,
          expense.friendId,
          expense.groupId,
          expense.tripId,
          expense.state,
          expense.version,
          expense.updatedAt,
        ],
      );
      await client.query('DELETE FROM expense_participants WHERE expense_id=$1', [expense.id]);
      await this.insertParticipants(client, expense.id, expense.participants);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async createExpense(expense: Expense): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO expenses(id,owner_id,payer_id,amount_minor,currency,description,category_id,category_kind,friend_id,group_id,trip_id,state,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [
          expense.id,
          expense.ownerId,
          expense.payerId,
          expense.amountMinor,
          expense.currency,
          expense.description,
          expense.categoryId,
          expense.categoryKind,
          expense.friendId,
          expense.groupId,
          expense.tripId,
          expense.state,
          expense.version,
          expense.createdAt,
          expense.updatedAt,
        ],
      );
      await this.insertParticipants(client, expense.id, expense.participants);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async listExpenses(): Promise<Expense[]> {
    const rows = await this.pool.query<ExpenseRow>('SELECT * FROM expenses ORDER BY created_at,id');
    const result: Expense[] = [];
    for (const row of rows.rows) result.push(await this.withParticipants(row));
    return result;
  }
  async addHistory(history: ExpenseHistory): Promise<void> {
    await this.pool.query(
      'INSERT INTO expense_history(id,expense_id,state,version,snapshot,changed_by,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        history.id,
        history.expenseId,
        history.state,
        history.version,
        history.snapshot,
        history.changedBy,
        history.changedAt,
      ],
    );
  }
  async listHistory(expenseId: string): Promise<ExpenseHistory[]> {
    const result = await this.pool.query<HistoryRow>(
      'SELECT * FROM expense_history WHERE expense_id=$1 ORDER BY version,id',
      [expenseId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      expenseId: row.expense_id,
      state: row.state,
      version: row.version,
      snapshot: row.snapshot,
      changedBy: row.changed_by,
      changedAt: row.changed_at.toISOString(),
    }));
  }
  async findIdempotency(
    scope: string,
    key: string,
  ): Promise<{ hash: string; response: unknown } | undefined> {
    const result = await this.pool.query<IdempotencyRow>(
      'SELECT payload_hash,response FROM ledger_idempotency_keys WHERE owner_id=$1 AND idempotency_key=$2',
      [scope, key],
    );
    return result.rows[0]
      ? { hash: result.rows[0].payload_hash, response: result.rows[0].response }
      : undefined;
  }
  async saveIdempotency(
    scope: string,
    key: string,
    hash: string,
    response: unknown,
  ): Promise<void> {
    await this.pool.query(
      'INSERT INTO ledger_idempotency_keys(owner_id,idempotency_key,payload_hash,response) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,idempotency_key) DO NOTHING',
      [scope, key, hash, response],
    );
  }

  async persistMutation(mutation: ExpenseMutation): Promise<MutationResult> {
    const client = await this.pool.connect();
    const lockKey = `${mutation.scope}\u0000${mutation.key}`;
    try {
      await client.query('BEGIN');
      // Serialize retries across service instances before checking and writing
      // the idempotency record. This keeps the expense, history and receipt in
      // one owning-database transaction.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      const existing = await client.query<IdempotencyRow>(
        'SELECT payload_hash,response FROM ledger_idempotency_keys WHERE owner_id=$1 AND idempotency_key=$2 FOR UPDATE',
        [mutation.scope, mutation.key],
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return existing.rows[0].payload_hash === mutation.hash
          ? { status: 'duplicate', response: existing.rows[0].response }
          : { status: 'mismatch' };
      }

      if (mutation.operation === 'create') {
        const inserted = await client.query(
          'INSERT INTO expenses(id,owner_id,payer_id,amount_minor,currency,description,category_id,category_kind,friend_id,group_id,trip_id,state,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING',
          [
            mutation.expense.id,
            mutation.expense.ownerId,
            mutation.expense.payerId,
            mutation.expense.amountMinor,
            mutation.expense.currency,
            mutation.expense.description,
            mutation.expense.categoryId,
            mutation.expense.categoryKind,
            mutation.expense.friendId,
            mutation.expense.groupId,
            mutation.expense.tripId,
            mutation.expense.state,
            mutation.expense.version,
            mutation.expense.createdAt,
            mutation.expense.updatedAt,
          ],
        );
        if (!inserted.rowCount) {
          await client.query('ROLLBACK');
          return { status: 'conflict' };
        }
        await this.insertParticipants(client, mutation.expense.id, mutation.expense.participants);
      } else {
        const current = await client.query<{ version: number }>(
          'SELECT version FROM expenses WHERE id=$1 FOR UPDATE',
          [mutation.expense.id],
        );
        if (!current.rows[0])
          throw new LedgerError('EXPENSE_NOT_FOUND', 'Expense was not found.', 404);
        if (
          mutation.expectedVersion !== undefined &&
          current.rows[0].version !== mutation.expectedVersion
        )
          throw new LedgerError(
            'CONFLICT',
            'Expense version no longer matches the client version.',
            409,
          );
        const updated = await client.query(
          'UPDATE expenses SET payer_id=$2,amount_minor=$3,currency=$4,description=$5,category_id=$6,category_kind=$7,friend_id=$8,group_id=$9,trip_id=$10,state=$11,version=$12,updated_at=$13 WHERE id=$1',
          [
            mutation.expense.id,
            mutation.expense.payerId,
            mutation.expense.amountMinor,
            mutation.expense.currency,
            mutation.expense.description,
            mutation.expense.categoryId,
            mutation.expense.categoryKind,
            mutation.expense.friendId,
            mutation.expense.groupId,
            mutation.expense.tripId,
            mutation.expense.state,
            mutation.expense.version,
            mutation.expense.updatedAt,
          ],
        );
        if (!updated.rowCount)
          throw new LedgerError(
            'CONFLICT',
            'Expense version no longer matches the client version.',
            409,
          );
        await client.query('DELETE FROM expense_participants WHERE expense_id=$1', [
          mutation.expense.id,
        ]);
        await this.insertParticipants(client, mutation.expense.id, mutation.expense.participants);
      }
      await client.query(
        'INSERT INTO expense_history(id,expense_id,state,version,snapshot,changed_by,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          mutation.history.id,
          mutation.history.expenseId,
          mutation.history.state,
          mutation.history.version,
          mutation.history.snapshot,
          mutation.history.changedBy,
          mutation.history.changedAt,
        ],
      );
      await client.query(
        'INSERT INTO ledger_idempotency_keys(owner_id,idempotency_key,payload_hash,response) VALUES($1,$2,$3,$4)',
        [mutation.scope, mutation.key, mutation.hash, mutation.expense],
      );
      await client.query(
        'INSERT INTO ledger_outbox(id,event_version,event_type,occurred_at,owner_id,correlation_id,producer,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          mutation.event.id,
          mutation.event.version,
          mutation.event.type,
          mutation.event.occurredAt,
          mutation.event.ownerId,
          mutation.event.correlationId,
          mutation.event.producer,
          mutation.event.payload,
        ],
      );
      await this.refreshBalanceProjection(client);
      await client.query('COMMIT');
      return { status: 'inserted' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async createCategory(category: Category): Promise<void> {
    await this.pool.query(
      'INSERT INTO ledger_categories(id,owner_id,name,standard,created_at) VALUES($1,$2,$3,$4,$5)',
      [category.id, category.ownerId, category.name, category.standard, category.createdAt],
    );
  }
  async findCategory(id: string): Promise<Category | undefined> {
    const result = await this.pool.query<CategoryRow>(
      'SELECT * FROM ledger_categories WHERE id=$1',
      [id],
    );
    return result.rows[0] ? toCategory(result.rows[0]) : undefined;
  }
  async listCategories(ownerId: string): Promise<Category[]> {
    const result = await this.pool.query<CategoryRow>(
      'SELECT * FROM ledger_categories WHERE standard=true OR owner_id=$1 ORDER BY name',
      [ownerId],
    );
    return result.rows.map(toCategory);
  }

  async readPairBalance(userId: string, counterpartyId: string): Promise<PairBalance> {
    const result = await this.pool.query<{ currency: string; net_minor: string }>(
      'SELECT currency, net_minor::text FROM ledger_pair_balances WHERE user_id=$1 AND counterparty_id=$2 AND net_minor <> 0 ORDER BY currency',
      [userId, counterpartyId],
    );
    return pairResult(userId, counterpartyId, result.rows);
  }

  async readGroupDebt(groupId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM ledger_group_balances WHERE group_id=$1 AND user_id=$2 AND net_minor <> 0 LIMIT 1',
      [groupId, userId],
    );
    return Boolean(result.rowCount);
  }

  async readFeed(
    ownerId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ cursor?: string; events: LedgerOutboxEvent[] }> {
    const position = decodeFeedCursor(cursor, ownerId, this.feedSecret);
    const pageSize = Math.max(1, Math.min(limit, 100));
    const result = await this.pool.query<OutboxRow>(
      `SELECT id,event_version,event_type,occurred_at,owner_id,correlation_id,producer,payload,attempts,COALESCE(lease_token,'') AS lease_token
         FROM ledger_outbox
        WHERE owner_id=$1
          AND ($2::timestamptz IS NULL OR (occurred_at,id) > ($2::timestamptz,$3::uuid))
        ORDER BY occurred_at,id LIMIT $4`,
      [ownerId, position?.occurredAt ?? null, position?.id ?? null, pageSize + 1],
    );
    const rows = result.rows.slice(0, pageSize);
    const last = rows[rows.length - 1];
    return {
      ...(last
        ? { cursor: encodeFeedCursor(ownerId, last.occurred_at, last.id, this.feedSecret) }
        : cursor
          ? { cursor }
          : {}),
      events: rows.map(toOutboxEvent),
    };
  }

  async claimOutbox(now: Date): Promise<
    | {
        event: LedgerOutboxEvent;
        leaseToken: string;
        attempts: number;
      }
    | undefined
  > {
    await this.pool.query(
      'UPDATE ledger_outbox SET dead_at=COALESCE(dead_at,now()), lease_until=NULL, lease_token=NULL WHERE published_at IS NULL AND dead_at IS NULL AND attempts >= 8',
    );
    const token = randomUUID();
    const result = await this.pool.query<OutboxRow>(
      `WITH next AS (
        SELECT id FROM ledger_outbox
         WHERE published_at IS NULL AND dead_at IS NULL AND attempts < 8 AND available_at <= $1
           AND (lease_until IS NULL OR lease_until <= $1)
         ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE ledger_outbox o SET attempts=o.attempts+1, lease_until=$2, lease_token=$3
       FROM next WHERE o.id=next.id
       RETURNING o.id,o.event_version,o.event_type,o.occurred_at,o.owner_id,o.correlation_id,o.producer,o.payload,o.attempts,o.lease_token`,
      [now, new Date(now.valueOf() + 30_000), token],
    );
    const row = result.rows[0];
    return row
      ? { event: toOutboxEvent(row), leaseToken: row.lease_token, attempts: row.attempts }
      : undefined;
  }

  async completeOutbox(id: string, leaseToken: string): Promise<void> {
    await this.pool.query(
      'UPDATE ledger_outbox SET published_at=COALESCE(published_at,now()), lease_until=NULL, lease_token=NULL WHERE id=$1 AND published_at IS NULL AND dead_at IS NULL AND lease_token=$2',
      [id, leaseToken],
    );
  }

  async retryOutbox(
    id: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    await this.pool.query(
      'UPDATE ledger_outbox SET available_at=$3, lease_until=NULL, lease_token=NULL, last_error=$4, dead_at=CASE WHEN $5 THEN COALESCE(dead_at,now()) ELSE dead_at END WHERE id=$1 AND lease_token=$2 AND published_at IS NULL AND dead_at IS NULL',
      [id, leaseToken, retryAt, error, terminal],
    );
  }

  private async refreshBalanceProjection(client: PoolClient): Promise<void> {
    // Serialize full projection refreshes so concurrent mutations cannot lose
    // a committed expense from the narrow BR-010 read model.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ledger:balance-projection'))");
    await client.query('DELETE FROM ledger_pair_balances');
    await client.query(
      `WITH contributions AS (
        SELECT e.payer_id AS user_id, p.user_id AS counterparty_id, e.currency,
               p.share_minor AS net_minor
          FROM expenses e JOIN expense_participants p ON p.expense_id=e.id
         WHERE e.state <> 'DELETED' AND e.payer_id <> p.user_id
        UNION ALL
        SELECT p.user_id AS user_id, e.payer_id AS counterparty_id, e.currency,
               -p.share_minor AS net_minor
          FROM expenses e JOIN expense_participants p ON p.expense_id=e.id
         WHERE e.state <> 'DELETED' AND e.payer_id <> p.user_id
      )
      INSERT INTO ledger_pair_balances(user_id,counterparty_id,currency,net_minor)
      SELECT user_id,counterparty_id,currency,SUM(net_minor)
        FROM contributions GROUP BY user_id,counterparty_id,currency`,
    );
    await client.query('DELETE FROM ledger_group_balances');
    await client.query(
      `WITH contributions AS (
        SELECT e.group_id, e.payer_id AS user_id, e.currency, p.share_minor AS net_minor
          FROM expenses e JOIN expense_participants p ON p.expense_id=e.id
         WHERE e.state <> 'DELETED' AND e.group_id IS NOT NULL AND e.payer_id <> p.user_id
        UNION ALL
        SELECT e.group_id, p.user_id AS user_id, e.currency, -p.share_minor AS net_minor
          FROM expenses e JOIN expense_participants p ON p.expense_id=e.id
         WHERE e.state <> 'DELETED' AND e.group_id IS NOT NULL AND e.payer_id <> p.user_id
      )
      INSERT INTO ledger_group_balances(group_id,user_id,currency,net_minor)
      SELECT group_id,user_id,currency,SUM(net_minor)
        FROM contributions GROUP BY group_id,user_id,currency`,
    );
  }
  private async withParticipants(row: ExpenseRow): Promise<Expense> {
    const participants = await this.pool.query<ParticipantRow>(
      'SELECT * FROM expense_participants WHERE expense_id=$1 ORDER BY user_id',
      [row.id],
    );
    return toExpense(row, participants.rows);
  }
  private async insertParticipants(
    client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    expenseId: string,
    participants: ExpenseParticipant[],
  ): Promise<void> {
    for (const participant of participants)
      await client.query(
        'INSERT INTO expense_participants(expense_id,user_id,share_minor) VALUES($1,$2,$3)',
        [expenseId, participant.userId, participant.shareMinor],
      );
  }
}
function toExpense(row: ExpenseRow, participants: ParticipantRow[]): Expense {
  return {
    id: row.id,
    ownerId: row.owner_id,
    payerId: row.payer_id,
    amountMinor: String(row.amount_minor),
    currency: row.currency,
    description: row.description,
    categoryId: row.category_id,
    categoryKind: row.category_kind,
    friendId: row.friend_id,
    groupId: row.group_id,
    tripId: row.trip_id,
    participants: participants.map((item) => ({
      userId: item.user_id,
      shareMinor: String(item.share_minor),
    })),
    state: row.state,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    standard: row.standard,
    createdAt: row.created_at.toISOString(),
  };
}

function pairResult(
  userId: string,
  counterpartyId: string,
  rows: Array<{ currency: string; net_minor: string }>,
): PairBalance {
  const balances = rows.map((row) => ({
    currency: row.currency.trim(),
    netMinor: String(row.net_minor),
  }));
  return {
    userId,
    counterpartyId,
    balances,
    hasOutstandingDebt: balances.some((row) => row.netMinor !== '0'),
    netMinor: balances.length === 1 ? balances[0]!.netMinor : balances.length === 0 ? '0' : null,
    currency: balances.length === 1 ? balances[0]!.currency : null,
  };
}

function toOutboxEvent(row: OutboxRow): LedgerOutboxEvent {
  return {
    id: row.id,
    version: 1,
    type: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    ownerId: row.owner_id,
    correlationId: row.correlation_id,
    producer: 'ledger',
    payload: row.payload,
  };
}

function encodeFeedCursor(ownerId: string, occurredAt: Date, id: string, secret: string): string {
  const body = Buffer.from(
    JSON.stringify({ ownerId, occurredAt: occurredAt.toISOString(), id }),
    'utf8',
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function decodeFeedCursor(
  cursor: string | undefined,
  ownerId: string,
  secret: string,
): { occurredAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const [body, signature] = cursor.split('.');
    if (!body || !signature) throw new Error('invalid');
    const expected = createHmac('sha256', secret).update(body).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw new Error('invalid');
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      ownerId?: unknown;
      occurredAt?: unknown;
      id?: unknown;
    };
    if (
      value.ownerId !== ownerId ||
      typeof value.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(value.occurredAt)) ||
      typeof value.id !== 'string' ||
      !isUuid(value.id)
    )
      throw new Error('invalid');
    return { occurredAt: value.occurredAt, id: value.id };
  } catch {
    throw new LedgerError('INVALID_CURSOR', 'Ledger feed cursor is invalid.', 400);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
