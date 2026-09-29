import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { IdentityUserResolution } from '@equa/contracts';

import { IdentityConfigService } from '../config/identity-config.service';
import { DatabaseService } from '../database/database.service';

interface IdentityLookupRow {
  id: string;
  email: string;
  username: string | null;
}

@Controller('internal/identity')
export class IdentityController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IdentityConfigService) private readonly config: IdentityConfigService,
  ) {}

  @Get('users/resolve')
  @ApiExcludeEndpoint()
  async resolve(
    @Query('identifier') identifier: string | undefined,
    @Headers('x-equa-service-key') serviceKey: string | undefined,
  ): Promise<IdentityUserResolution> {
    const expected = this.config.serviceKey;
    if (!expected || serviceKey !== expected) throw new ForbiddenException('Invalid service key.');
    const normalized = identifier?.trim().toLowerCase();
    if (!normalized) throw new NotFoundException('Identity was not found.');
    const result = await this.database.query<IdentityLookupRow>(
      "SELECT id,email,username FROM users WHERE status='ACTIVE' AND (lower(email)=$1 OR lower(username)=$1) LIMIT 1",
      [normalized],
    );
    const user = result.rows[0];
    if (!user) throw new NotFoundException('Identity was not found.');
    return { id: user.id, email: user.email, username: user.username };
  }
}
