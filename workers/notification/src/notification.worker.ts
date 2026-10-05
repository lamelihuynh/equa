import {
  GROUP_INVITATION_CREATED_EVENT,
  type DomainEvent,
  type NotificationJob,
} from '@equa/contracts';

const maxAttempts = 8;

export interface ClaimedNotificationJob extends NotificationJob {
  leaseToken: string;
  attempts: number;
}

export interface NotificationStore {
  persistInboxAndJobs(
    event: DomainEvent,
    jobs: readonly NotificationJob[],
  ): Promise<'inserted' | 'duplicate'>;
  claimDue(
    now: Date,
    supportedTypes?: readonly string[],
  ): Promise<ClaimedNotificationJob | undefined>;
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
  readonly supportedTypes?: readonly string[];
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
    private readonly reportRecoverableError: (stage: 'ingest' | 'poll') => void = () => undefined,
  ) {}
  async ingest(event: DomainEvent, message: RabbitMessage): Promise<void> {
    try {
      const jobs = notificationJobsFor(event);
      await this.store.persistInboxAndJobs(event, jobs);
      message.ack();
    } catch {
      this.reportSafely('ingest');
      message.nack(false);
    }
  }
  async deliverOne(): Promise<void> {
    if (!this.provider.enabled) return;
    const job = await this.store.claimDue(this.now(), this.provider.supportedTypes);
    if (!job) return;
    try {
      await this.provider.deliver(job, job.deliveryId);
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
          this.reportSafely('poll');
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

  private reportSafely(stage: 'ingest' | 'poll'): void {
    try {
      this.reportRecoverableError(stage);
    } catch {
      // Reporting must not break the worker's recovery loop.
    }
  }
}

function notificationJobsFor(event: DomainEvent): NotificationJob[] {
  if (event.type === GROUP_INVITATION_CREATED_EVENT) {
    const payload = event.payload;
    if (
      typeof payload.invitationId !== 'string' ||
      payload.invitationId !== event.id ||
      typeof payload.recipientEmail !== 'string' ||
      !payload.recipientEmail.trim() ||
      typeof payload.groupName !== 'string' ||
      typeof payload.inviterName !== 'string' ||
      typeof payload.inviterEmail !== 'string' ||
      typeof payload.appUrl !== 'string'
    )
      throw new Error('Group invitation event is missing email delivery details.');
    return [
      {
        eventId: event.id,
        deliveryId: `notification:${event.id}:${event.ownerId}`,
        ownerId: event.ownerId,
        type: event.type,
        payload: { ...payload },
      },
    ];
  }
  if (event.type !== 'expense.created' && event.type !== 'expense.updated') return [];
  const actorId = event.payload.actorId;
  if (typeof actorId !== 'string') return [];

  const declaredRecipients = event.payload.addedParticipantIds;
  let recipientIds: string[];
  if (Array.isArray(declaredRecipients)) {
    if (!declaredRecipients.every(isUuid))
      throw new Error('Expense event contains an invalid added participant id.');
    recipientIds = declaredRecipients;
  } else if (declaredRecipients !== undefined) {
    throw new Error('Expense event addedParticipantIds must be an array.');
  } else if (event.type === 'expense.created' && Array.isArray(event.payload.participants)) {
    recipientIds = event.payload.participants.map((participant: unknown) => {
      if (!isRecord(participant) || !isUuid(participant.userId))
        throw new Error('Expense event contains an invalid participant.');
      return participant.userId;
    });
  } else {
    return [];
  }

  return [...new Set(recipientIds)]
    .filter((recipientId) => recipientId !== actorId)
    .sort()
    .map((recipientId) => ({
      eventId: event.id,
      deliveryId: `notification:${event.id}:${recipientId}`,
      ownerId: recipientId,
      type: event.type,
      payload: { ...event.payload, recipientUserId: recipientId },
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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
