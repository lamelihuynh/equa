import { createHash } from 'node:crypto';

import type { RecurringRuleInput } from '@equa/contracts';

import type { LedgerAdapter } from '../ledger/ledger.adapter.js';

export interface Rule extends RecurringRuleInput {
  ownerId: string;
  nextRunAt: Date;
  disabled: boolean;
  revision: number;
}
export interface Execution {
  key: string;
  ruleId: string;
  occurrence: string;
  ownerId: string;
  payload: Record<string, unknown>;
  attempts: number;
  leaseUntil?: Date;
  completed: boolean;
}

export class AutomationService {
  private readonly rules = new Map<string, Rule>();
  private readonly executions = new Map<string, Execution>();
  constructor(
    private readonly ledger: LedgerAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(ownerId: string, input: RecurringRuleInput): Rule {
    if (this.rules.has(input.id)) throw new Error('Recurring rule already exists.');
    const nextRunAt = new Date(input.startsAt);
    if (Number.isNaN(nextRunAt.valueOf()) || !isDaily(input.schedule))
      throw new Error('Only daily ISO schedules are supported.');
    const rule = { ...input, ownerId, nextRunAt, disabled: false, revision: 1 };
    this.rules.set(input.id, rule);
    return rule;
  }
  update(ownerId: string, id: string, input: Omit<RecurringRuleInput, 'id'>): Rule {
    const previous = this.requireOwner(ownerId, id);
    if (previous.disabled) throw new Error('Recurring rule is disabled.');
    const nextRunAt = new Date(input.startsAt);
    if (Number.isNaN(nextRunAt.valueOf()) || !isDaily(input.schedule))
      throw new Error('Only daily ISO schedules are supported.');
    const rule = { ...previous, ...input, nextRunAt, revision: previous.revision + 1 };
    this.rules.set(id, rule);
    return rule;
  }
  disable(ownerId: string, id: string): void {
    this.requireOwner(ownerId, id).disabled = true;
  }
  async tick(): Promise<void> {
    const now = this.now();
    for (const rule of this.rules.values()) {
      if (rule.disabled || rule.nextRunAt > now) continue;
      const occurrence = rule.nextRunAt.toISOString();
      const key = `recurring:${rule.id}:${occurrence}`;
      if (!this.executions.has(key))
        this.executions.set(key, {
          key,
          ruleId: rule.id,
          occurrence,
          ownerId: rule.ownerId,
          payload: structuredClone(rule.payload),
          attempts: 0,
          completed: false,
        });
      rule.nextRunAt = new Date(rule.nextRunAt.valueOf() + 86_400_000);
      await this.execute(key);
    }
  }
  async execute(key: string): Promise<void> {
    const execution = this.executions.get(key);
    if (!execution || execution.completed) return;
    const now = this.now();
    if (execution.leaseUntil && execution.leaseUntil > now) return;
    execution.leaseUntil = new Date(now.valueOf() + 30_000);
    execution.attempts += 1;
    try {
      await this.ledger.createRecurringOccurrence({
        idempotencyKey: key,
        ownerId: execution.ownerId,
        payload: execution.payload,
      });
      execution.completed = true;
      execution.leaseUntil = undefined;
    } catch (error) {
      execution.leaseUntil = undefined;
      throw error;
    }
  }
  execution(key: string): Execution | undefined {
    return this.executions.get(key);
  }
  private requireOwner(ownerId: string, id: string): Rule {
    const rule = this.rules.get(id);
    if (!rule || rule.ownerId !== ownerId) throw new Error('Recurring rule not found.');
    return rule;
  }
}
function isDaily(schedule: string): boolean {
  return schedule === 'P1D';
}
export function operationHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
