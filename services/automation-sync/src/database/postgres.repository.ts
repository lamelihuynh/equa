import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export interface ClaimedExecution {
  key: string;
  ownerId: string;
  payload: Record<string, unknown>;
  leaseToken: string;
}

export interface SyncReservation {
  state: 'claimed' | 'duplicate' | 'mismatch' | 'busy' | 'blocked' | 'failed';
  leaseToken?: string;
  version?: number;
  code?: string;
  retryable?: boolean;
}

export interface StoredRule {
  id: string;
  ownerId: string;
  schedule: string;
  startsAt: string;
  payload: Record<string, unknown>;
  revision: number;
  disabled: boolean;
}

export class AutomationDatabase {
  private readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Claims pending or expired leased snapshots before scheduling new occurrences. */
  async claimDue(now: Date): Promise<ClaimedExecution[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed: ClaimedExecution[] = [];
      const retries = await client.query<{
        idempotency_key: string;
        owner_id: string;
        payload_snapshot: Record<string, unknown>;
        lease_token: string;
      }>(
        "WITH due AS (SELECT e.idempotency_key, r.owner_id, e.payload_snapshot FROM recurring_executions e JOIN recurring_rules r ON r.id = e.rule_id WHERE e.completed_at IS NULL AND e.attempts < 8 AND (e.status = 'pending' OR (e.status = 'leased' AND e.lease_until <= $1)) ORDER BY e.occurrence_at FOR UPDATE OF e SKIP LOCKED) UPDATE recurring_executions e SET status = 'leased', attempts = e.attempts + 1, lease_until = $2, lease_token = md5(random()::text || clock_timestamp()::text) FROM due WHERE e.idempotency_key = due.idempotency_key RETURNING e.idempotency_key, due.owner_id, due.payload_snapshot, e.lease_token",
        [now, new Date(now.valueOf() + 30_000)],
      );
      for (const retry of retries.rows)
        claimed.push({
          key: retry.idempotency_key,
          ownerId: retry.owner_id,
          payload: retry.payload_snapshot,
          leaseToken: retry.lease_token,
        });
      const rules = await client.query<{
        id: string;
        owner_id: string;
        next_run_at: Date;
        payload: Record<string, unknown>;
      }>(
        'SELECT id, owner_id, next_run_at, payload FROM recurring_rules WHERE disabled_at IS NULL AND next_run_at <= $1 FOR UPDATE SKIP LOCKED',
        [now],
      );
      for (const rule of rules.rows) {
        const occurrence = rule.next_run_at.toISOString();
        const key = `recurring:${rule.id}:${occurrence}`;
        await client.query(
          "INSERT INTO recurring_executions (idempotency_key, rule_id, occurrence_at, payload_snapshot, status) VALUES ($1, $2, $3, $4, 'pending') ON CONFLICT (idempotency_key) DO NOTHING",
          [key, rule.id, rule.next_run_at, rule.payload],
        );
        const execution = await client.query<{ idempotency_key: string; lease_token: string }>(
          "UPDATE recurring_executions SET status = 'leased', attempts = attempts + 1, lease_until = $2, lease_token = md5(random()::text || clock_timestamp()::text) WHERE idempotency_key = $1 AND completed_at IS NULL AND attempts < 8 AND status = 'pending' RETURNING idempotency_key, lease_token",
          [key, new Date(now.valueOf() + 30_000)],
        );
        await client.query(
          "UPDATE recurring_rules SET next_run_at = next_run_at + INTERVAL '1 day' WHERE id = $1",
          [rule.id],
        );
        if (execution.rowCount)
          claimed.push({
            key,
            ownerId: rule.owner_id,
            payload: rule.payload,
            leaseToken: execution.rows[0]!.lease_token,
          });
      }
      await client.query('COMMIT');
      return claimed;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async completeExecution(key: string, leaseToken: string): Promise<void> {
    await this.pool.query(
      "UPDATE recurring_executions SET status = 'completed', completed_at = now(), lease_until = NULL WHERE idempotency_key = $1 AND status = 'leased' AND lease_token = $2",
      [key, leaseToken],
    );
  }
  async releaseExecution(
    key: string,
    leaseToken: string,
    error: string,
    consumeAttempt = true,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE recurring_executions SET status = 'pending', lease_until = NULL, attempts = CASE WHEN $4 THEN attempts ELSE GREATEST(attempts - 1, 0) END, last_error = $3 WHERE idempotency_key = $1 AND status = 'leased' AND lease_token = $2",
      [key, leaseToken, error, consumeAttempt],
    );
  }

  async reserveSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    hash: string,
    request: unknown,
  ): Promise<SyncReservation> {
    const client = await this.pool.connect();
    const leaseUntil = new Date(Date.now() + 30_000);
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO sync_device_sequences (owner_id, device_id) VALUES ($1, $2) ON CONFLICT (owner_id, device_id) DO NOTHING',
        [ownerId, deviceId],
      );
      await client.query(
        'SELECT next_sequence FROM sync_device_sequences WHERE owner_id = $1 AND device_id = $2 FOR UPDATE',
        [ownerId, deviceId],
      );
      const row = await client.query<{
        payload_hash: string;
        status: string;
        receipt: { version?: number } | null;
        lease_until: Date | null;
        sequence: string;
        last_error: string | null;
        failure_code: string | null;
      }>(
        'SELECT payload_hash, status, receipt, lease_until, sequence, last_error, failure_code FROM sync_operations WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 FOR UPDATE',
        [ownerId, deviceId, operationId],
      );
      let operation = row.rows[0];
      if (!operation) {
        const sequence = await client.query<{ value: string }>(
          'UPDATE sync_device_sequences SET next_sequence = next_sequence + 1 WHERE owner_id = $1 AND device_id = $2 RETURNING next_sequence - 1 AS value',
          [ownerId, deviceId],
        );
        const inserted = await client.query<{
          payload_hash: string;
          status: string;
          receipt: { version?: number } | null;
          lease_until: Date | null;
          sequence: string;
          last_error: string | null;
          failure_code: string | null;
        }>(
          "INSERT INTO sync_operations (owner_id, device_id, operation_id, payload_hash, request, status, sequence) VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING payload_hash, status, receipt, lease_until, sequence, last_error, failure_code",
          [ownerId, deviceId, operationId, hash, request, sequence.rows[0]!.value],
        );
        operation = inserted.rows[0];
      }
      if (!operation) throw new Error('Unable to reserve sync operation.');
      if (operation.payload_hash !== hash) {
        await client.query('COMMIT');
        return { state: 'mismatch' };
      }
      if (operation.status === 'completed') {
        await client.query('COMMIT');
        return { state: 'duplicate', version: operation.receipt?.version };
      }
      if (operation.status === 'failed') {
        await client.query('COMMIT');
        return {
          state: 'failed',
          retryable: false,
          code: operation.failure_code ?? 'LEDGER_REJECTED',
        };
      }
      const predecessor = await client.query(
        "SELECT 1 FROM sync_operations WHERE owner_id = $1 AND device_id = $2 AND sequence < $3 AND status NOT IN ('completed', 'failed') LIMIT 1",
        [ownerId, deviceId, operation.sequence],
      );
      if (predecessor.rowCount || operation.status === 'conflict') {
        await client.query('COMMIT');
        return { state: 'blocked' };
      }
      if (
        operation.status === 'leased' &&
        operation.lease_until &&
        operation.lease_until > new Date()
      ) {
        await client.query('COMMIT');
        return { state: 'busy' };
      }
      const token = randomUUID();
      try {
        const claimed = await client.query(
          "UPDATE sync_operations SET status = 'leased', attempts = attempts + 1, lease_until = $4, lease_token = $5 WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 AND (status = 'pending' OR (status = 'leased' AND lease_until <= $6)) RETURNING operation_id",
          [ownerId, deviceId, operationId, leaseUntil, token, new Date()],
        );
        if (!claimed.rowCount) {
          await client.query('COMMIT');
          return { state: 'busy' };
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          await client.query('COMMIT');
          return { state: 'busy' };
        }
        throw error;
      }
      await client.query('COMMIT');
      return { state: 'claimed', leaseToken: token };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async completeSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    version: number,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE sync_operations SET status = 'completed', receipt = $5, lease_until = NULL WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 AND status = 'leased' AND lease_token = $4",
      [ownerId, deviceId, operationId, leaseToken, { version }],
    );
  }
  async retrySync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    error: string,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE sync_operations SET status = 'pending', lease_until = NULL, last_error = $5 WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 AND status = 'leased' AND lease_token = $4",
      [ownerId, deviceId, operationId, leaseToken, error],
    );
  }
  async conflictSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    error: string,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE sync_operations SET status = 'conflict', lease_until = NULL, last_error = $5 WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 AND status = 'leased' AND lease_token = $4",
      [ownerId, deviceId, operationId, leaseToken, error],
    );
  }

  async failSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    code: string,
    error: string,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE sync_operations SET status = 'failed', lease_until = NULL, lease_token = NULL, failure_code = $5, last_error = $6 WHERE owner_id = $1 AND device_id = $2 AND operation_id = $3 AND status = 'leased' AND lease_token = $4",
      [ownerId, deviceId, operationId, leaseToken, code, error],
    );
  }
  async createRule(
    ownerId: string,
    input: { id: string; schedule: string; startsAt: string; payload: Record<string, unknown> },
  ): Promise<StoredRule> {
    const result = await this.pool.query<StoredRule>(
      'INSERT INTO recurring_rules (id, owner_id, schedule, next_run_at, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id, owner_id AS "ownerId", schedule, next_run_at::text AS "startsAt", payload, revision, false AS disabled',
      [input.id, ownerId, input.schedule, input.startsAt, input.payload],
    );
    return result.rows[0]!;
  }
  async readRule(ownerId: string, id: string): Promise<StoredRule | undefined> {
    const result = await this.pool.query<StoredRule>(
      'SELECT id, owner_id AS "ownerId", schedule, next_run_at::text AS "startsAt", payload, revision, disabled_at IS NOT NULL AS disabled FROM recurring_rules WHERE id = $1 AND owner_id = $2',
      [id, ownerId],
    );
    return result.rows[0];
  }
  async updateRule(
    ownerId: string,
    id: string,
    input: { schedule: string; startsAt: string; payload: Record<string, unknown> },
    revision: number,
  ): Promise<StoredRule | undefined> {
    const result = await this.pool.query<StoredRule>(
      'UPDATE recurring_rules SET schedule = $3, next_run_at = $4, payload = $5, revision = revision + 1 WHERE id = $1 AND owner_id = $2 AND disabled_at IS NULL AND revision = $6 RETURNING id, owner_id AS "ownerId", schedule, next_run_at::text AS "startsAt", payload, revision, false AS disabled',
      [id, ownerId, input.schedule, input.startsAt, input.payload, revision],
    );
    return result.rows[0];
  }
  async disableRule(ownerId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE recurring_rules SET disabled_at = now(), revision = revision + 1 WHERE id = $1 AND owner_id = $2 AND disabled_at IS NULL',
      [id, ownerId],
    );
    return Boolean(result.rowCount);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
