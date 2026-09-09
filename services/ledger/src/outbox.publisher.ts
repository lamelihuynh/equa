import type { LedgerOutboxEvent } from './types.js';

export interface ClaimedLedgerEvent {
  event: LedgerOutboxEvent;
  leaseToken: string;
  attempts: number;
}

export interface LedgerOutboxStore {
  claimOutbox(now: Date): Promise<ClaimedLedgerEvent | undefined>;
  completeOutbox(id: string, leaseToken: string): Promise<void>;
  retryOutbox(
    id: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void>;
}

export interface LedgerEventPublisher {
  publish(event: LedgerOutboxEvent): Promise<void>;
}

export class LedgerOutboxPublisher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  constructor(
    private readonly store: LedgerOutboxStore,
    private readonly publisher: LedgerEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async publishOne(): Promise<boolean> {
    const claimed = await this.store.claimOutbox(this.now());
    if (!claimed) return false;
    try {
      await this.publisher.publish(claimed.event);
      await this.store.completeOutbox(claimed.event.id, claimed.leaseToken);
    } catch (error) {
      const attempts = claimed.attempts;
      const terminal = attempts >= 8;
      const delay = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
      await this.store.retryOutbox(
        claimed.event.id,
        claimed.leaseToken,
        error instanceof Error ? error.message : 'Ledger event publication failed.',
        new Date(this.now().valueOf() + delay),
        terminal,
      );
    }
    return true;
  }

  start(intervalMs = 1_000): () => void {
    if (this.timer) return () => this.stop();
    const run = (): void => {
      if (this.running) return;
      this.running = true;
      void this.publishOne()
        .catch(() => undefined)
        .finally(() => {
          this.running = false;
        });
    };
    run();
    this.timer = setInterval(run, intervalMs);
    return () => this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
