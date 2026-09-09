import { LedgerUnavailableError, type LedgerAdapter } from '../ledger/ledger.adapter.js';
import type { AutomationDatabase } from '../database/postgres.repository.js';

export class PostgresScheduler {
  constructor(
    private readonly database: AutomationDatabase,
    private readonly ledger: LedgerAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async tick(): Promise<void> {
    if (this.ledger.availability === 'unavailable') return;
    const executions = await this.database.claimDue(this.now());
    for (const [index, execution] of executions.entries()) {
      try {
        await this.ledger.createRecurringOccurrence({
          idempotencyKey: execution.key,
          ownerId: execution.ownerId,
          payload: execution.payload,
        });
        await this.database.completeExecution(execution.key, execution.leaseToken);
      } catch (error) {
        await this.database.releaseExecution(
          execution.key,
          execution.leaseToken,
          error instanceof Error ? error.message : 'Ledger unavailable.',
          !(error instanceof LedgerUnavailableError),
        );
        if (error instanceof LedgerUnavailableError) {
          for (const remaining of executions.slice(index + 1)) {
            await this.database.releaseExecution(
              remaining.key,
              remaining.leaseToken,
              'Ledger unavailable.',
              false,
            );
          }
          return;
        }
      }
    }
  }
}
