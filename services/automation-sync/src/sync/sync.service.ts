import type { SyncOperation, SyncRequest, SyncResult as ContractSyncResult } from '@equa/contracts';

import { operationHash } from '../automation/automation.service.js';
import type { SyncReservation } from '../database/postgres.repository.js';
import { LedgerUnavailableError, type LedgerAdapter } from '../ledger/ledger.adapter.js';

export type SyncResult = ContractSyncResult;

export interface SyncReceiptStore {
  reserveSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    hash: string,
    request: unknown,
  ): Promise<SyncReservation>;
  completeSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    version: number,
  ): Promise<void>;
  retrySync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    error: string,
  ): Promise<void>;
  conflictSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    error: string,
  ): Promise<void>;
  failSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    code: string,
    error: string,
  ): Promise<void>;
}

/** Test-only persistence substitute; production always supplies AutomationDatabase. */
export class InMemorySyncReceiptStore implements SyncReceiptStore {
  private readonly rows = new Map<
    string,
    {
      hash: string;
      ownerId: string;
      deviceId: string;
      sequence: number;
      state: 'pending' | 'leased' | 'completed' | 'conflict' | 'failed';
      token?: string;
      version?: number;
      code?: string;
    }
  >();
  private readonly nextSequence = new Map<string, number>();
  reserveSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    hash: string,
    _request: unknown,
  ): Promise<SyncReservation> {
    void _request;
    const key = this.key(ownerId, deviceId, operationId);
    let row = this.rows.get(key);
    if (row && row.hash !== hash) return Promise.resolve({ state: 'mismatch' });
    if (row?.state === 'completed')
      return Promise.resolve({ state: 'duplicate', version: row.version });
    if (row?.state === 'failed')
      return Promise.resolve({ state: 'failed', code: row.code, retryable: false });
    if (row?.state === 'leased') return Promise.resolve({ state: 'busy' });
    if (!row) {
      const scope = this.scope(ownerId, deviceId);
      const sequence = this.nextSequence.get(scope) ?? 1;
      this.nextSequence.set(scope, sequence + 1);
      row = { hash, ownerId, deviceId, sequence, state: 'pending' };
      this.rows.set(key, row);
    }
    const blocked = [...this.rows.values()].some(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.deviceId === deviceId &&
        candidate.sequence < row.sequence &&
        candidate.state !== 'completed' &&
        candidate.state !== 'failed',
    );
    if (blocked || row.state === 'conflict') return Promise.resolve({ state: 'blocked' });
    const leaseToken = `${operationId}:${row.sequence}:${this.rows.size}`;
    row.state = 'leased';
    row.token = leaseToken;
    return Promise.resolve({ state: 'claimed', leaseToken });
  }
  completeSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    version: number,
  ): Promise<void> {
    const row = this.rows.get(this.key(ownerId, deviceId, operationId));
    if (row?.token === leaseToken) {
      row.state = 'completed';
      row.version = version;
    }
    return Promise.resolve();
  }
  retrySync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    _error: string,
  ): Promise<void> {
    void _error;
    const row = this.rows.get(this.key(ownerId, deviceId, operationId));
    if (row?.token === leaseToken) {
      row.state = 'pending';
      row.token = undefined;
    }
    return Promise.resolve();
  }
  conflictSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    _error: string,
  ): Promise<void> {
    void _error;
    const row = this.rows.get(this.key(ownerId, deviceId, operationId));
    if (row?.token === leaseToken) {
      row.state = 'conflict';
      row.token = undefined;
    }
    return Promise.resolve();
  }
  failSync(
    ownerId: string,
    deviceId: string,
    operationId: string,
    leaseToken: string,
    code: string,
    _error: string,
  ): Promise<void> {
    void _error;
    const row = this.rows.get(this.key(ownerId, deviceId, operationId));
    if (row?.token === leaseToken) {
      row.state = 'failed';
      row.code = code;
      row.token = undefined;
    }
    return Promise.resolve();
  }
  private scope(ownerId: string, deviceId: string): string {
    return `${ownerId}\u0000${deviceId}`;
  }
  private key(ownerId: string, deviceId: string, operationId: string): string {
    return `${this.scope(ownerId, deviceId)}\u0000${operationId}`;
  }
}

export class SyncService {
  constructor(
    private readonly ledger: LedgerAdapter,
    private readonly receipts: SyncReceiptStore = new InMemorySyncReceiptStore(),
  ) {}

  async push(ownerId: string, request: SyncRequest): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const operation of request.operations) {
      const result = await this.apply(ownerId, request.deviceId, operation);
      results.push(result);
      if (result.status !== 'applied') break;
    }
    return results;
  }
  async feed(ownerId: string, cursor?: string): Promise<{ cursor?: string; events: unknown[] }> {
    return this.ledger.readFeed(ownerId, cursor);
  }

  private async apply(
    ownerId: string,
    deviceId: string,
    operation: SyncOperation,
  ): Promise<SyncResult> {
    const reservation = await this.receipts.reserveSync(
      ownerId,
      deviceId,
      operation.id,
      operationHash(operation),
      operation,
    );
    if (reservation.state === 'mismatch')
      return {
        id: operation.id,
        status: 'failed',
        retryable: false,
        code: 'IDEMPOTENCY_KEY_REUSED',
      };
    if (reservation.state === 'failed')
      return {
        id: operation.id,
        status: 'failed',
        retryable: false,
        code: reservation.code ?? 'LEDGER_REJECTED',
      };
    if (reservation.state === 'duplicate')
      return { id: operation.id, status: 'applied', version: reservation.version };
    if (reservation.state === 'busy' || reservation.state === 'blocked')
      return {
        id: operation.id,
        status: 'failed',
        retryable: true,
        code: reservation.state === 'busy' ? 'SYNC_BUSY' : 'SYNC_BLOCKED',
      };
    const leaseToken = reservation.leaseToken;
    if (!leaseToken) throw new Error('Claimed sync operation is missing its lease token.');
    try {
      const result = await this.ledger.applySync(ownerId, deviceId, operation);
      await this.receipts.completeSync(ownerId, deviceId, operation.id, leaseToken, result.version);
      return { id: operation.id, status: 'applied', version: result.version };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ledger rejected operation.';
      if (isLedgerUnavailable(error)) {
        await this.receipts.retrySync(ownerId, deviceId, operation.id, leaseToken, message);
        throw new LedgerUnavailableError(message);
      }
      if (isConflict(error)) {
        await this.receipts.conflictSync(ownerId, deviceId, operation.id, leaseToken, message);
        return { id: operation.id, status: 'conflict' };
      }
      if (!isRetryableLedgerError(error)) {
        const code = errorCode(error);
        await this.receipts.failSync(ownerId, deviceId, operation.id, leaseToken, code, message);
        return { id: operation.id, status: 'failed', retryable: false, code };
      }
      await this.receipts.retrySync(ownerId, deviceId, operation.id, leaseToken, message);
      return { id: operation.id, status: 'failed', retryable: true, code: 'LEDGER_RETRYABLE' };
    }
  }
}

function isLedgerUnavailable(error: unknown): boolean {
  return error instanceof LedgerUnavailableError;
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'CONFLICT'
  );
}

function isRetryableLedgerError(error: unknown): boolean {
  if (error instanceof LedgerUnavailableError) return true;
  return !(
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    error.retryable === false
  );
}

function errorCode(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'LEDGER_REJECTED';
}
