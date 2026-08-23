import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

export interface AuditInput {
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId: string;
  outcome: 'SUCCESS' | 'FAILURE';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async record(input: AuditInput): Promise<void> {
    await this.database.query(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, resource_type, resource_id, correlation_id, ip_address, user_agent, outcome, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        randomUUID(),
        input.actorUserId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.correlationId,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.outcome,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
