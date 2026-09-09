import type { DomainEvent, NotificationJob } from '@equa/contracts';

const maxAttempts = 8;

export interface ClaimedNotificationJob extends NotificationJob {
  leaseToken: string;
  attempts: number;
}

export interface NotificationStore {
  persistInboxAndJob(event: DomainEvent, job: NotificationJob): Promise<'inserted' | 'duplicate'>;
  claimDue(now: Date): Promise<ClaimedNotificationJob | undefined>;
  complete(deliveryId: string, leaseToken: string): Promise<void>;
  retry(
    deliveryId: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void>;
}

export interface NotificationProvider {
  readonly enabled: boolean;
  deliver(job: NotificationJob, idempotencyKey: string): Promise<void>;
}
export interface RabbitMessage {
  ack(): void;
  nack(requeue: boolean): void;
}

export class ProviderDeliveryError extends Error {
  constructor(
    readonly status?: number,
    readonly retryAfterMs?: number,
    message = 'Provider delivery failed.',
  ) {
    super(message);
  }
}

export class NotificationWorker {
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  constructor(
    private readonly store: NotificationStore,
    private readonly provider: NotificationProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly reportRecoverableError: () => void = () => undefined,
  ) {}
  async ingest(event: DomainEvent, message: RabbitMessage): Promise<void> {
    try {
      await this.store.persistInboxAndJob(event, {
        eventId: event.id,
        deliveryId: `notification:${event.id}`,
        ownerId: event.ownerId,
        type: event.type,
        payload: event.payload,
      });
      message.ack();
    } catch {
      message.nack(false);
    }
  }
  async deliverOne(): Promise<void> {
    if (!this.provider.enabled) return;
    const job = await this.store.claimDue(this.now());
    if (!job) return;
    try {
      await this.provider.deliver(job, `notification:${job.eventId}`);
      await this.store.complete(job.deliveryId, job.leaseToken);
    } catch (error) {
      const failure = failureDetails(error, job.attempts);
      await this.store.retry(
        job.deliveryId,
        job.leaseToken,
        failure.message,
        failure.retryAt(this.now()),
        failure.terminal,
      );
    }
  }

  /** Starts a single-flight recoverable polling loop. Individual DB failures do not stop it. */
  start(intervalMs = 30_000): () => void {
    if (this.pollTimer) return () => this.stop();
    const run = (): void => {
      if (this.polling) return;
      this.polling = true;
      void this.deliverOne()
        .catch(() => {
          try {
            this.reportRecoverableError();
          } catch {
            // Reporting must not break the worker's recovery loop.
          }
        })
        .finally(() => {
          this.polling = false;
        });
    };
    run();
    this.pollTimer = setInterval(run, intervalMs);
    return () => this.stop();
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }
}

/** Explicitly disabled until an authenticated provider contract is configured. */
export class DisabledNotificationProvider implements NotificationProvider {
  readonly enabled = false;
  deliver(): Promise<void> {
    return Promise.reject(new Error('Provider disabled.'));
  }
}

function failureDetails(
  error: unknown,
  attempts: number,
): {
  message: string;
  terminal: boolean;
  retryAt: (now: Date) => Date;
} {
  const providerError = error instanceof ProviderDeliveryError ? error : undefined;
  const status = providerError?.status;
  const terminal =
    attempts >= maxAttempts ||
    (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429);
  const delay =
    providerError?.retryAfterMs ?? Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
  return {
    message: error instanceof Error ? error.message : 'Provider delivery failed.',
    terminal,
    retryAt: (now) => new Date(now.valueOf() + delay),
  };
}
