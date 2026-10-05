import type { ClaimedSocialEvent, SocialOutboxStore } from './social.repository.js';
import type { DomainEvent } from '@equa/contracts';

export interface SocialEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export class SocialOutboxPublisher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly store: SocialOutboxStore,
    private readonly publisher: SocialEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async publishOne(): Promise<boolean> {
    const claimed: ClaimedSocialEvent | undefined = await this.store.claimOutbox(this.now());
    if (!claimed) return false;
    try {
      await this.publisher.publish(claimed.event);
      await this.store.completeOutbox(claimed.event.id, claimed.leaseToken);
    } catch (error) {
      const terminal = claimed.attempts >= 8;
      const delay = Math.min(300_000, 1_000 * 2 ** Math.min(claimed.attempts, 8));
      await this.store.retryOutbox(
        claimed.event.id,
        claimed.leaseToken,
        error instanceof Error ? error.message : 'Social event publication failed.',
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
