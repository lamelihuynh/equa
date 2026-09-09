/** Versioned contracts shared by automation, sync and notification consumers. */
export const AUTOMATION_CONTRACT_VERSION = 1 as const;

export interface RecurringRuleInput {
  id: string;
  schedule: string;
  startsAt: string;
  payload: Record<string, unknown>;
}

export interface SyncOperation {
  id: string;
  entity: string;
  /** Server entity id. Operation id remains the durable client receipt key. */
  entityId?: string;
  expectedVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncResult {
  id: string;
  status: 'applied' | 'conflict' | 'failed';
  version?: number;
  retryable?: boolean;
  code?: string;
}

export type ExpenseSyncAction = 'create' | 'update' | 'delete';

export interface ExpenseSyncPayload {
  action: ExpenseSyncAction;
  expenseId?: string;
  amountMinor?: string;
  currency?: string;
  description?: string;
  payerId?: string;
  participants?: Array<{ userId: string; shareMinor: string }>;
  categoryId?: string | null;
  friendId?: string | null;
  groupId?: string | null;
  tripId?: string | null;
}

export interface ExpenseEventEnvelope extends DomainEvent {
  type: 'expense.created' | 'expense.updated' | 'expense.deleted';
  payload: Record<string, unknown> & ExpenseSyncPayload & { expenseId: string; version: number };
}

export interface SyncRequest {
  version: typeof AUTOMATION_CONTRACT_VERSION;
  deviceId: string;
  operations: SyncOperation[];
  cursor?: string;
}

export interface DomainEvent {
  version: typeof AUTOMATION_CONTRACT_VERSION;
  id: string;
  type: string;
  occurredAt: string;
  ownerId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  producer?: string;
}

export interface NotificationJob {
  eventId: string;
  deliveryId: string;
  ownerId: string;
  type: string;
  payload: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function parseSyncRequest(value: unknown): SyncRequest | undefined {
  if (
    !isRecord(value) ||
    value.version !== AUTOMATION_CONTRACT_VERSION ||
    !isNonEmptyString(value.deviceId)
  )
    return undefined;
  if (
    !Array.isArray(value.operations) ||
    value.operations.some((operation) => !isSyncOperation(operation))
  )
    return undefined;
  if (value.cursor !== undefined && !isNonEmptyString(value.cursor)) return undefined;
  return value as unknown as SyncRequest;
}

function isSyncOperation(value: unknown): value is SyncOperation {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.entity) &&
    (value.entityId === undefined || isNonEmptyString(value.entityId)) &&
    typeof value.expectedVersion === 'number' &&
    Number.isSafeInteger(value.expectedVersion) &&
    value.expectedVersion >= 0 &&
    isRecord(value.payload) &&
    isNonEmptyString(value.createdAt)
  );
}

export function parseDomainEvent(value: unknown): DomainEvent | undefined {
  if (!isRecord(value) || value.version !== AUTOMATION_CONTRACT_VERSION) return undefined;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.type) ||
    !isNonEmptyString(value.occurredAt) ||
    !isNonEmptyString(value.ownerId) ||
    !isRecord(value.payload)
  )
    return undefined;
  if (value.correlationId !== undefined && !isNonEmptyString(value.correlationId)) return undefined;
  if (value.producer !== undefined && !isNonEmptyString(value.producer)) return undefined;
  return value as unknown as DomainEvent;
}
