import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

import { IdentityConfigService } from '../config/identity-config.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(IdentityConfigService) config: IdentityConfigService) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }

  query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(operation: (client: Pool) => Promise<T>): Promise<T> {
    return operation(this.pool);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
