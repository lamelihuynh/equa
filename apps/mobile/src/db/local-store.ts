import { parseDomainEvent, type DomainEvent, type SyncOperation } from '@equa/contracts';

export interface SqliteRunResult {
  changes: number;
  lastInsertRowId?: number;
}

export interface SqliteDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<SqliteRunResult>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface LocalOperation {
  id: string;
  ownerId: string;
  deviceId: string;
  payload: string;
  state: 'pending' | 'sending' | 'conflict' | 'quarantined' | 'terminal';
  queueSequence: number;
  attempts: number;
  dependencies: string[];
  claimToken?: string;
  failureCode?: string;
  failureMessage?: string;
}

export class LocalStore {
  private readonly changeListeners = new Set<() => void>();
  constructor(private readonly db: SqliteDatabase) {}

  static async open(name = 'equa-sync.db'): Promise<LocalStore> {
    const sqlite = await import('expo-sqlite');
    const db = await sqlite.openDatabaseAsync(name);
    const store = new LocalStore(db);
    await store.initialize();
    return store;
  }

  async initialize(): Promise<void> {
    await this.db.execAsync('PRAGMA journal_mode = WAL');
    await this.db.withTransactionAsync(async () => {
      const version = await this.db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
      const columns = await this.db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(sync_operations)',
      );
      const names = new Set(columns.map((column) => column.name));
      const required = [
        'queue_sequence',
        'id',
        'owner_id',
        'device_id',
        'payload',
        'dependencies',
        'state',
        'attempts',
        'retry_at',
        'lease_until',
        'claim_token',
        'failure_code',
        'last_error',
      ];
      if (!columns.length) await this.createQueueTable();
      else if (required.some((column) => !names.has(column))) await this.migrateQueueTable(names);
      await this.db.execAsync(
        'CREATE TABLE IF NOT EXISTS local_entities (owner_id TEXT NOT NULL, entity_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (owner_id, entity_id)); CREATE TABLE IF NOT EXISTS sync_completed_operations (owner_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (owner_id, id)); CREATE TABLE IF NOT EXISTS sync_devices (owner_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY (owner_id, device_id)); CREATE TABLE IF NOT EXISTS sync_installation (device_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL DEFAULT (unixepoch())); CREATE TABLE IF NOT EXISTS sync_cursors (owner_id TEXT NOT NULL, device_id TEXT NOT NULL, cursor TEXT, PRIMARY KEY (owner_id, device_id)); CREATE TABLE IF NOT EXISTS sync_received_events (owner_id TEXT NOT NULL, device_id TEXT NOT NULL, event_id TEXT NOT NULL, received_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (owner_id, device_id, event_id)); CREATE TABLE IF NOT EXISTS sync_deferred_events (owner_id TEXT NOT NULL, device_id TEXT NOT NULL, event_id TEXT NOT NULL, entity_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (owner_id, device_id, event_id)); INSERT OR IGNORE INTO sync_devices (owner_id, device_id) SELECT owner_id, device_id FROM sync_operations; INSERT OR IGNORE INTO sync_installation (device_id) SELECT device_id FROM sync_operations ORDER BY queue_sequence LIMIT 1; DROP INDEX IF EXISTS sync_operations_owner; CREATE INDEX IF NOT EXISTS sync_operations_owner ON sync_operations(owner_id, state, retry_at, queue_sequence);',
      );
      if ((version[0]?.user_version ?? 0) < 2 || required.some((column) => !names.has(column)))
        await this.db.execAsync('PRAGMA user_version = 2');
    });
  }

  async enqueue(operation: Omit<LocalOperation, 'queueSequence' | 'claimToken'>): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO sync_operations (id, owner_id, device_id, payload, dependencies, state, attempts) VALUES (?, ?, ?, ?, ?, ?, ?)',
      operation.id,
      operation.ownerId,
      operation.deviceId,
      operation.payload,
      JSON.stringify(operation.dependencies),
      operation.state,
      operation.attempts,
    );
    await this.db.runAsync(
      'INSERT OR IGNORE INTO sync_devices (owner_id, device_id) VALUES (?, ?)',
      operation.ownerId,
      operation.deviceId,
    );
    await this.db.runAsync(
      'INSERT OR IGNORE INTO sync_installation (device_id) VALUES (?)',
      operation.deviceId,
    );
    this.notifyChanged();
  }

  /** Writes the local projection and durable outbox entry in one SQLite transaction. */
  async mutate(
    ownerId: string,
    deviceId: string,
    operation: SyncOperation,
    dependencies: string[] = [],
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO local_entities (owner_id, entity_id, value) VALUES (?, ?, ?) ON CONFLICT(owner_id, entity_id) DO UPDATE SET value = excluded.value',
        ownerId,
        canonicalEntityKey(operation),
        JSON.stringify(operation.payload),
      );
      await this.enqueue({
        id: operation.id,
        ownerId,
        deviceId,
        payload: JSON.stringify(operation),
        dependencies,
        state: 'pending',
        attempts: 0,
      });
    });
  }

  async claim(ownerId: string, limit = 20, now = Date.now()): Promise<LocalOperation[]> {
    await this.db.runAsync(
      "UPDATE sync_operations SET state = 'pending', lease_until = NULL, claim_token = NULL WHERE owner_id = ? AND state = 'sending' AND lease_until <= ?",
      ownerId,
      now,
    );
    const rows = await this.db.getAllAsync<LocalOperationRow>(
      "SELECT id, owner_id AS ownerId, device_id AS deviceId, payload, state, queue_sequence AS queueSequence, attempts, dependencies, failure_code AS failureCode, last_error AS failureMessage FROM sync_operations WHERE owner_id = ? AND state = 'pending' AND retry_at <= ? ORDER BY queue_sequence ASC",
      ownerId,
      now,
    );
    const claimed: LocalOperation[] = [];
    for (const row of rows) {
      if (claimed.length >= limit) break;
      const dependencies = parseDependencies(row.dependencies);
      if (!(await this.dependenciesComplete(ownerId, dependencies))) continue;
      const claimToken = `${row.id}:${row.queueSequence}:${now}`;
      const update = await this.db.runAsync(
        "UPDATE sync_operations SET state = 'sending', attempts = attempts + 1, lease_until = ?, claim_token = ? WHERE id = ? AND owner_id = ? AND state = 'pending'",
        now + 30_000,
        claimToken,
        row.id,
        ownerId,
      );
      if (update.changes) {
        claimed.push({ ...row, dependencies, claimToken });
      }
    }
    return claimed;
  }

  /** Returns the next durable time at which this owner's queue can make progress. */
  async nextWakeAt(ownerId: string): Promise<number | undefined> {
    const rows = await this.db.getAllAsync<WakeRow>(
      "SELECT state, retry_at AS retryAt, lease_until AS leaseUntil, dependencies FROM sync_operations WHERE owner_id = ? AND ((state = 'pending') OR (state = 'sending' AND lease_until IS NOT NULL))",
      ownerId,
    );
    let wakeAt: number | undefined;
    for (const row of rows) {
      if (
        row.state === 'pending' &&
        !(await this.dependenciesComplete(ownerId, parseDependencies(row.dependencies)))
      )
        continue;
      const candidate = row.state === 'pending' ? row.retryAt : row.leaseUntil;
      if (typeof candidate === 'number' && (wakeAt === undefined || candidate < wakeAt))
        wakeAt = candidate;
    }
    return wakeAt;
  }

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  async complete(
    ownerId: string,
    id: string,
    claimToken: string,
    acknowledgedVersion?: number,
  ): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const operationRows = await this.db.getAllAsync<{ payload: string }>(
        "SELECT payload FROM sync_operations WHERE id = ? AND owner_id = ? AND state = 'sending' AND claim_token = ?",
        id,
        ownerId,
        claimToken,
      );
      const complete = await this.db.runAsync(
        "INSERT OR IGNORE INTO sync_completed_operations (owner_id, id) SELECT owner_id, id FROM sync_operations WHERE id = ? AND owner_id = ? AND state = 'sending' AND claim_token = ?",
        id,
        ownerId,
        claimToken,
      );
      if (complete.changes)
        await this.db.runAsync(
          "DELETE FROM sync_operations WHERE id = ? AND owner_id = ? AND state = 'sending' AND claim_token = ?",
          id,
          ownerId,
          claimToken,
        );
      if (complete.changes && operationRows[0]) {
        try {
          const operation = JSON.parse(operationRows[0].payload) as SyncOperation;
          const entityKey = canonicalEntityKey(operation);
          if (isEntityVersion(acknowledgedVersion)) {
            // The server acknowledgement is the authoritative local version.
            // Persist it before resolving deferred feed events so an older
            // event cannot overwrite a successful local mutation.
            await this.db.runAsync(
              'INSERT INTO local_entities (owner_id, entity_id, value) VALUES (?, ?, ?) ON CONFLICT(owner_id, entity_id) DO UPDATE SET value = excluded.value',
              ownerId,
              entityKey,
              JSON.stringify({ ...operation.payload, version: acknowledgedVersion }),
            );
          }
          await this.applyDeferredForEntity(ownerId, entityKey, acknowledgedVersion);
        } catch {
          // A malformed local operation cannot safely identify a remote entity.
        }
      }
    });
    this.notifyChanged();
  }

  async retry(
    ownerId: string,
    id: string,
    claimToken: string,
    retryAt: number,
    terminal: boolean,
    failureCode?: string,
    failureMessage?: string,
  ): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_operations SET state = CASE WHEN ? = 1 OR attempts >= 8 THEN 'terminal' ELSE 'pending' END, retry_at = ?, lease_until = NULL, claim_token = NULL, failure_code = ?, last_error = ? WHERE id = ? AND owner_id = ? AND state = 'sending' AND claim_token = ?",
      terminal ? 1 : 0,
      retryAt,
      failureCode ?? null,
      failureMessage ?? null,
      id,
      ownerId,
      claimToken,
    );
    this.notifyChanged();
  }

  async conflict(ownerId: string, id: string, claimToken: string): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_operations SET state = 'conflict', lease_until = NULL, claim_token = NULL WHERE id = ? AND owner_id = ? AND state = 'sending' AND claim_token = ?",
      id,
      ownerId,
      claimToken,
    );
    this.notifyChanged();
  }

  /** Explicitly abandons a resolved conflict, then reconciles deferred remote state. */
  async resolveConflict(ownerId: string, id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const rows = await this.db.getAllAsync<{ payload: string }>(
        "SELECT payload FROM sync_operations WHERE owner_id = ? AND id = ? AND state = 'conflict'",
        ownerId,
        id,
      );
      if (!rows[0]) return;
      await this.db.runAsync(
        "DELETE FROM sync_operations WHERE owner_id = ? AND id = ? AND state = 'conflict'",
        ownerId,
        id,
      );
      try {
        await this.applyDeferredForEntity(
          ownerId,
          canonicalEntityKey(JSON.parse(rows[0].payload) as SyncOperation),
        );
      } catch {
        // Keep the conflict row removed while leaving malformed deferred data untouched.
      }
    });
    this.notifyChanged();
  }

  async feedCursor(ownerId: string, deviceId: string): Promise<string | undefined> {
    const rows = await this.db.getAllAsync<{ cursor: string | null }>(
      'SELECT cursor FROM sync_cursors WHERE owner_id = ? AND device_id = ?',
      ownerId,
      deviceId,
    );
    return rows[0]?.cursor ?? undefined;
  }

  async primaryDevice(ownerId: string): Promise<string | undefined> {
    const rows = await this.db.getAllAsync<{ device_id: string }>(
      'SELECT device_id FROM sync_installation LIMIT 1',
    );
    const deviceId = rows[0]?.device_id ?? createInstallationDeviceId();
    await this.db.runAsync(
      'INSERT OR IGNORE INTO sync_installation (device_id) VALUES (?)',
      deviceId,
    );
    await this.db.runAsync(
      'INSERT OR IGNORE INTO sync_devices (owner_id, device_id) VALUES (?, ?)',
      ownerId,
      deviceId,
    );
    return deviceId;
  }

  async entity(ownerId: string, entityKey: string): Promise<unknown> {
    const rows = await this.db.getAllAsync<{ value: string }>(
      'SELECT value FROM local_entities WHERE owner_id = ? AND entity_id = ?',
      ownerId,
      entityKey,
    );
    if (!rows[0]) return undefined;
    try {
      return JSON.parse(rows[0].value) as unknown;
    } catch {
      return undefined;
    }
  }

  async deferredEventIds(ownerId: string, deviceId: string): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ event_id: string }>(
      'SELECT event_id FROM sync_deferred_events WHERE owner_id = ? AND device_id = ? ORDER BY event_id',
      ownerId,
      deviceId,
    );
    return rows.map((row) => row.event_id);
  }

  /** Applies an authenticated feed page and its checkpoint atomically. */
  async applyFeed(
    ownerId: string,
    deviceId: string,
    values: unknown[],
    checkpoint?: string,
  ): Promise<void> {
    const events = values.flatMap((value) => {
      const event = parseDomainEvent(value);
      return event && event.ownerId === ownerId ? [event] : [];
    });
    await this.db.withTransactionAsync(async () => {
      for (const event of events) await this.applyEvent(ownerId, deviceId, event);
      if (checkpoint !== undefined)
        await this.db.runAsync(
          'INSERT INTO sync_cursors (owner_id, device_id, cursor) VALUES (?, ?, ?) ON CONFLICT(owner_id, device_id) DO UPDATE SET cursor = excluded.cursor',
          ownerId,
          deviceId,
          checkpoint,
        );
    });
    if (events.length || checkpoint !== undefined) this.notifyChanged();
  }

  async quarantine(ownerId: string): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_operations SET state = 'quarantined', lease_until = NULL, claim_token = NULL WHERE owner_id = ? AND state IN ('pending', 'sending')",
      ownerId,
    );
    this.notifyChanged();
  }

  private async dependenciesComplete(ownerId: string, dependencies: string[]): Promise<boolean> {
    for (const id of dependencies) {
      const rows = await this.db.getAllAsync<{ id: string }>(
        'SELECT id FROM sync_completed_operations WHERE owner_id = ? AND id = ?',
        ownerId,
        id,
      );
      if (!rows.length) return false;
    }
    return true;
  }

  private async applyEvent(ownerId: string, deviceId: string, event: DomainEvent): Promise<void> {
    const receipt = await this.db.runAsync(
      'INSERT OR IGNORE INTO sync_received_events (owner_id, device_id, event_id) VALUES (?, ?, ?)',
      ownerId,
      deviceId,
      event.id,
    );
    if (!receipt.changes || !isExpenseEvent(event)) return;
    const entityKey = expenseEntityKey(event);
    const localOperations = await this.db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM sync_operations WHERE owner_id = ? AND state IN ('pending', 'sending', 'conflict')",
      ownerId,
    );
    const hasLocalEdit = localOperations.some((row) => {
      try {
        return canonicalEntityKey(JSON.parse(row.payload) as SyncOperation) === entityKey;
      } catch {
        return false;
      }
    });
    const value = JSON.stringify(event.payload);
    if (hasLocalEdit) {
      await this.db.runAsync(
        'INSERT OR IGNORE INTO sync_deferred_events (owner_id, device_id, event_id, entity_id, value) VALUES (?, ?, ?, ?, ?)',
        ownerId,
        deviceId,
        event.id,
        entityKey,
        value,
      );
      return;
    }
    const current = await this.entity(ownerId, entityKey);
    if (current && entityVersion(current) >= entityVersion(event.payload)) return;
    await this.db.runAsync(
      'INSERT INTO local_entities (owner_id, entity_id, value) VALUES (?, ?, ?) ON CONFLICT(owner_id, entity_id) DO UPDATE SET value = excluded.value',
      ownerId,
      entityKey,
      value,
    );
  }

  private async applyDeferredForEntity(
    ownerId: string,
    entityKey: string,
    acknowledgedVersion?: number,
  ): Promise<void> {
    const unresolved = await this.db.getAllAsync<{ payload: string }>(
      "SELECT payload FROM sync_operations WHERE owner_id = ? AND state IN ('pending', 'sending', 'conflict')",
      ownerId,
    );
    if (
      unresolved.some((row) => {
        try {
          return canonicalEntityKey(JSON.parse(row.payload) as SyncOperation) === entityKey;
        } catch {
          return false;
        }
      })
    )
      return;
    const deferred = await this.db.getAllAsync<{ event_id: string; value: string }>(
      'SELECT event_id, value FROM sync_deferred_events WHERE owner_id = ? AND entity_id = ? ORDER BY event_id',
      ownerId,
      entityKey,
    );
    if (!deferred.length) return;
    const values = deferred.flatMap((row) => {
      try {
        return [{ eventId: row.event_id, value: JSON.parse(row.value) as unknown }];
      } catch {
        return [];
      }
    });
    const eligible = values.filter(
      ({ value }) =>
        !isEntityVersion(acknowledgedVersion) || entityVersion(value) > acknowledgedVersion,
    );
    const highest = eligible
      .sort((left, right) => entityVersion(left.value) - entityVersion(right.value))
      .at(-1);
    const current = await this.entity(ownerId, entityKey);
    if (highest && (!current || entityVersion(current) < entityVersion(highest.value)))
      await this.db.runAsync(
        'INSERT INTO local_entities (owner_id, entity_id, value) VALUES (?, ?, ?) ON CONFLICT(owner_id, entity_id) DO UPDATE SET value = excluded.value',
        ownerId,
        entityKey,
        JSON.stringify(highest.value),
      );
    await this.db.runAsync(
      'DELETE FROM sync_deferred_events WHERE owner_id = ? AND entity_id = ?',
      ownerId,
      entityKey,
    );
  }

  private async createQueueTable(): Promise<void> {
    await this.db.execAsync(
      "CREATE TABLE sync_operations (queue_sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, device_id TEXT NOT NULL, payload TEXT NOT NULL, dependencies TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, claim_token TEXT, failure_code TEXT, last_error TEXT)",
    );
  }

  /** Rebuilds the legacy outbox so SQLite can add an AUTOINCREMENT primary key safely. */
  private async migrateQueueTable(columns: Set<string>): Promise<void> {
    await this.db.execAsync('ALTER TABLE sync_operations RENAME TO sync_operations_legacy');
    await this.createQueueTable();
    const sequence = columns.has('queue_sequence') ? 'queue_sequence' : 'NULL';
    const dependencies = columns.has('dependencies') ? "COALESCE(dependencies, '[]')" : "'[]'";
    const attempts = columns.has('attempts') ? 'COALESCE(attempts, 0)' : '0';
    const retryAt = columns.has('retry_at') ? 'COALESCE(retry_at, 0)' : '0';
    const leaseUntil = columns.has('lease_until') ? 'lease_until' : 'NULL';
    const claimToken = columns.has('claim_token') ? 'claim_token' : 'NULL';
    const failureCode = columns.has('failure_code') ? 'failure_code' : 'NULL';
    const lastError = columns.has('last_error') ? 'last_error' : 'NULL';
    await this.db.execAsync(
      `INSERT INTO sync_operations (queue_sequence, id, owner_id, device_id, payload, dependencies, state, attempts, retry_at, lease_until, claim_token, failure_code, last_error) SELECT ${sequence}, id, owner_id, device_id, payload, ${dependencies}, CASE WHEN state = 'sending' THEN 'pending' ELSE state END, ${attempts}, ${retryAt}, CASE WHEN state = 'sending' THEN NULL ELSE ${leaseUntil} END, CASE WHEN state = 'sending' THEN NULL ELSE ${claimToken} END, ${failureCode}, ${lastError} FROM sync_operations_legacy`,
    );
    await this.db.execAsync('DROP TABLE sync_operations_legacy');
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) listener();
  }
}

function isEntityVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

interface LocalOperationRow extends Omit<LocalOperation, 'dependencies' | 'claimToken'> {
  dependencies: string;
}

interface WakeRow {
  state: 'pending' | 'sending';
  retryAt: number | null;
  leaseUntil: number | null;
  dependencies: string;
}

function parseDependencies(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function canonicalEntityKey(operation: SyncOperation): string {
  if (operation.entity.startsWith('expense:')) return operation.entity;
  if (operation.entity === 'expense') {
    const payloadId = operation.payload.expenseId;
    const id = operation.entityId ?? (typeof payloadId === 'string' ? payloadId : operation.id);
    return `expense:${id}`;
  }
  if (operation.entity.includes(':')) return operation.entity;
  return `${operation.entity}:${operation.entityId ?? operation.id}`;
}

function isExpenseEvent(event: DomainEvent): boolean {
  return (
    (event.type === 'expense.created' ||
      event.type === 'expense.updated' ||
      event.type === 'expense.deleted') &&
    typeof event.payload.expenseId === 'string' &&
    Number.isSafeInteger(event.payload.version) &&
    (event.payload.version as number) >= 1
  );
}

function expenseEntityKey(event: DomainEvent): string {
  const expenseId = event.payload.expenseId;
  return `expense:${typeof expenseId === 'string' ? expenseId : event.id}`;
}

function entityVersion(value: unknown): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return -1;
  const version = (value as Record<string, unknown>).version;
  return typeof version === 'number' && Number.isSafeInteger(version) ? version : -1;
}

function createInstallationDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
