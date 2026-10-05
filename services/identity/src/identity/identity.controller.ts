import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { IdentityUserResolution, IdentityUserSummary } from '@equa/contracts';

import { IdentityConfigService } from '../config/identity-config.service';
import { DatabaseService } from '../database/database.service';

interface IdentityLookupRow {
  id: string;
  email: string;
  username: string | null;
  display_name: string;
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
    this.requireServiceKey(serviceKey);
    const normalized = identifier?.trim().toLowerCase();
    if (!normalized) throw new NotFoundException('Identity was not found.');
    const result = await this.database.query<IdentityLookupRow>(
      "SELECT u.id,u.email,u.username,p.display_name FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.status='ACTIVE' AND (lower(u.email)=$1 OR lower(u.username)=$1) LIMIT 1",
      [normalized],
    );
    const user = result.rows[0];
    if (!user) throw new NotFoundException('Identity was not found.');
    return {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      username: user.username,
    };
  }

  @Post('users/resolve-many')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async resolveMany(
    @Body() body: unknown,
    @Headers('x-equa-service-key') serviceKey: string | undefined,
  ): Promise<IdentityUserSummary[]> {
    this.requireServiceKey(serviceKey);
    if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > 100)
      throw new BadRequestException('At most 100 user ids are required.');
    if (!body.ids.every(isUuid)) throw new BadRequestException('User ids must be UUIDs.');
    const ids = [...new Set(body.ids)];
    if (!ids.length) return [];
    const result = await this.database.query<IdentityLookupRow>(
      "SELECT u.id,u.email,u.username,p.display_name FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.status='ACTIVE' AND u.id=ANY($1::uuid[])",
      [ids],
    );
    return result.rows.map((user) => ({
      id: user.id,
      displayName: user.display_name,
      email: user.email,
    }));
  }

  private requireServiceKey(serviceKey: string | undefined): void {
    const expected = this.config.serviceKey;
    if (!expected || serviceKey !== expected) throw new ForbiddenException('Invalid service key.');
  }
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
