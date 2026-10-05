import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { withDatabaseName } from './connection-string.js';

loadEnv({ path: join(process.cwd(), '../../.env') });

const ADMIN_DATABASE = 'postgres';
const LEDGER_DATABASE = 'equa_ledger';

async function main(): Promise<void> {
  const configuredUrl = process.env.LEDGER_DATABASE_URL;
  if (!configuredUrl) throw new Error('LEDGER_DATABASE_URL must be configured.');
  const connectionString = withDatabaseName(configuredUrl, LEDGER_DATABASE);
  const configuredDatabaseName = decodeURIComponent(new URL(configuredUrl).pathname.slice(1));
  const adminConnectionString =
    configuredDatabaseName === LEDGER_DATABASE
      ? withDatabaseName(connectionString, ADMIN_DATABASE)
      : configuredDatabaseName === 'equa_identity'
        ? configuredUrl
        : undefined;
  if (!adminConnectionString)
    throw new Error('LEDGER_DATABASE_URL must target equa_identity or equa_ledger.');
  await ensureLedgerDatabase(connectionString, adminConnectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const directory = join(process.cwd(), 'src/database/migrations');
    for (const name of (await readdir(directory))
      .filter((entry) => entry.endsWith('.sql'))
      .sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount)
        continue;
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

async function ensureLedgerDatabase(
  connectionString: string,
  adminConnectionString: string,
): Promise<void> {
  const adminClient = new Client({ connectionString: adminConnectionString });
  try {
    await adminClient.connect();
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      LEDGER_DATABASE,
    ]);
    if (exists.rowCount) return;

    const role = await adminClient.query<{ rolcreatedb: boolean }>(
      'SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    if (!role.rows[0]?.rolcreatedb)
      throw new Error(
        `Database "${LEDGER_DATABASE}" does not exist and PostgreSQL user lacks CREATEDB permission. Create it with an administrator, then rerun Ledger migrations.`,
      );
    await adminClient.query(`CREATE DATABASE "${LEDGER_DATABASE}"`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('lacks CREATEDB permission')) throw error;
    if (isPostgresError(error, '42P04')) return;
    if (isPostgresError(error, '42501'))
      throw new Error(
        `Cannot ensure database "${LEDGER_DATABASE}": PostgreSQL user lacks CREATEDB permission or cannot access the admin database "${ADMIN_DATABASE}".`,
        { cause: error },
      );
    throw error;
  } finally {
    await adminClient.end();
  }
}

void main();

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
