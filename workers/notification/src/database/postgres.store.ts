import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import type { DomainEvent, NotificationJob } from '@equa/contracts';
import type { ClaimedNotificationJob, NotificationStore } from '../notification.worker.js';

export class PostgresNotificationStore implements NotificationStore {
  private readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }
  async persistInboxAndJob(
    event: DomainEvent,
    job: NotificationJob,
  ): Promise<'inserted' | 'duplicate'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inbox = await client.query(
        'INSERT INTO notification_inbox (event_id, event) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [event.id, event],
      );
      if (!inbox.rowCount) {
        await client.query('COMMIT');
        return 'duplicate';
      }
      await client.query(
        "INSERT INTO notification_jobs (delivery_id, event_id, owner_id, type, payload, status, provider_id) VALUES ($1, $2, $3, $4, $5, 'pending', $6)",
        [
          job.deliveryId,
          job.eventId,
          job.ownerId,
          job.type,
          job.payload,
          `notification:${job.eventId}`,
        ],
      );
      await client.query('COMMIT');
      return 'inserted';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async claimDue(now: Date): Promise<ClaimedNotificationJob | undefined> {
    const token = randomUUID();
    await this.pool.query(
      "UPDATE notification_jobs SET status = 'dead', lease_until = NULL, last_error = COALESCE(last_error, 'Retry budget exhausted') WHERE attempts >= 8 AND ((status = 'pending') OR (status = 'leased' AND lease_until <= $1))",
      [now],
    );
    const result = await this.pool.query<{
      delivery_id: string;
      event_id: string;
      owner_id: string;
      type: string;
      payload: Record<string, unknown>;
      attempts: number;
      lease_token: string;
    }>(
      "WITH next AS (SELECT delivery_id FROM notification_jobs WHERE attempts < 8 AND ((status = 'pending' AND available_at <= $1) OR (status = 'leased' AND lease_until <= $1)) ORDER BY available_at, delivery_id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE notification_jobs j SET status = 'leased', attempts = j.attempts + 1, lease_until = $2, lease_token = $3 FROM next WHERE j.delivery_id = next.delivery_id RETURNING j.delivery_id, j.event_id, j.owner_id, j.type, j.payload, j.attempts, j.lease_token",
      [now, new Date(now.valueOf() + 30_000), token],
    );
    const row = result.rows[0];
    return row
      ? {
          deliveryId: row.delivery_id,
          eventId: row.event_id,
          ownerId: row.owner_id,
          type: row.type,
          payload: row.payload,
          attempts: row.attempts,
          leaseToken: row.lease_token,
        }
      : undefined;
  }
  async complete(deliveryId: string, leaseToken: string): Promise<void> {
    await this.pool.query(
      "UPDATE notification_jobs SET status = 'completed', lease_until = NULL WHERE delivery_id = $1 AND status = 'leased' AND lease_token = $2",
      [deliveryId, leaseToken],
    );
  }
  async retry(
    deliveryId: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE notification_jobs SET status = $3, lease_until = NULL, available_at = $4, last_error = $5 WHERE delivery_id = $1 AND status = 'leased' AND lease_token = $2",
      [deliveryId, leaseToken, terminal ? 'dead' : 'pending', retryAt, error],
    );
  }
}
