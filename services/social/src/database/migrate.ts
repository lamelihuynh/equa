import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: join(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const connectionString = process.env.SOCIAL_DATABASE_URL;
  if (!connectionString) throw new Error('SOCIAL_DATABASE_URL must be configured.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const directory = join(process.cwd(), 'src/database/migrations');
    const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of names) {
      const seen = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (seen.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(join(directory, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

void main();
