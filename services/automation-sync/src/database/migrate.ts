import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { automationDatabaseConnections, quoteDatabaseIdentifier } from './connection-string.js';

loadEnv({ path: join(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const configuredConnectionString = process.env.AUTOMATION_SYNC_DATABASE_URL;
  if (!configuredConnectionString)
    throw new Error('AUTOMATION_SYNC_DATABASE_URL must be configured.');
  const connections = automationDatabaseConnections(configuredConnectionString);
  await ensureAutomationDatabase(connections.databaseName, connections.adminConnectionString);
  const client = new Client({ connectionString: connections.connectionString });
  await client.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const directory = join(process.cwd(), 'src/database/migrations');
    for (const name of (await readdir(directory))
      .filter((entry) => entry.endsWith('.sql'))
      .sort()) {
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

async function ensureAutomationDatabase(
  databaseName: string,
  adminConnectionString: string,
): Promise<void> {
  const client = new Client({ connectionString: adminConnectionString });
  try {
    await client.connect();
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (found.rowCount) return;
    const role = await client.query<{ rolcreatedb: boolean }>(
      'SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    if (!role.rows[0]?.rolcreatedb)
      throw new Error(
        `Database "${databaseName}" does not exist and PostgreSQL user lacks CREATEDB permission. Create it with an administrator, then rerun Automation migrations.`,
      );
    try {
      await client.query(`CREATE DATABASE ${quoteDatabaseIdentifier(databaseName)}`);
    } catch (error) {
      if (isPostgresError(error, '42P04')) return;
      if (isPostgresError(error, '42501'))
        throw new Error(
          `Cannot create database "${databaseName}": PostgreSQL user lacks CREATEDB permission.`,
          { cause: error },
        );
      throw error;
    }
  } finally {
    await client.end();
  }
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

void main();
