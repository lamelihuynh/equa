import type { DomainEvent, NotificationJob } from '@equa/contracts';

import type { ClaimedNotificationJob, NotificationStore } from './notification.worker.js';

interface StoredJob extends NotificationJob {
  attempts: number;
  availableAt: Date;
  leaseUntil?: Date;
  leaseToken?: string;
  status: 'pending' | 'leased' | 'completed' | 'dead';
}

export class InMemoryNotificationStore implements NotificationStore {
  private readonly inbox = new Set<string>();
  private readonly jobs = new Map<string, StoredJob>();
  claims = 0;
  persistInboxAndJob(event: DomainEvent, job: NotificationJob): Promise<'inserted' | 'duplicate'> {
    if (this.inbox.has(event.id)) return Promise.resolve('duplicate');
    this.inbox.add(event.id);
    this.jobs.set(job.deliveryId, {
      ...job,
      attempts: 0,
      availableAt: new Date(0),
      status: 'pending',
    });
    return Promise.resolve('inserted');
  }
  claimDue(now: Date): Promise<ClaimedNotificationJob | undefined> {
    for (const candidate of this.jobs.values()) {
      if (
        candidate.attempts >= 8 &&
        (candidate.status === 'pending' ||
          (candidate.status === 'leased' &&
            candidate.leaseUntil !== undefined &&
            candidate.leaseUntil <= now))
      ) {
        candidate.status = 'dead';
        candidate.leaseUntil = undefined;
      }
    }
    const job = [...this.jobs.values()]
      .filter(
        (candidate) =>
          candidate.attempts < 8 &&
          ((candidate.status === 'pending' && candidate.availableAt <= now) ||
            (candidate.status === 'leased' &&
              candidate.leaseUntil !== undefined &&
              candidate.leaseUntil <= now)),
      )
      .sort((left, right) => left.availableAt.valueOf() - right.availableAt.valueOf())[0];
    if (!job) return Promise.resolve(undefined);
    this.claims += 1;
    job.status = 'leased';
    job.attempts += 1;
    job.leaseUntil = new Date(now.valueOf() + 30_000);
    job.leaseToken = `${job.deliveryId}:${job.attempts}`;
    return Promise.resolve({ ...job, leaseToken: job.leaseToken });
  }
  complete(deliveryId: string, leaseToken: string): Promise<void> {
    const job = this.jobs.get(deliveryId);
    if (job?.status === 'leased' && job.leaseToken === leaseToken) job.status = 'completed';
    return Promise.resolve();
  }
  retry(
    deliveryId: string,
    leaseToken: string,
    _error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    const job = this.jobs.get(deliveryId);
    if (job?.status === 'leased' && job.leaseToken === leaseToken) {
      job.status = terminal ? 'dead' : 'pending';
      job.availableAt = retryAt;
      job.leaseUntil = undefined;
    }
    return Promise.resolve();
  }
  count(): number {
    return [...this.jobs.values()].filter(
      (job) => job.status !== 'completed' && job.status !== 'dead',
    ).length;
  }
}
