import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

import { withDatabaseName } from './connection-string.js';

loadEnv({ path: join(process.cwd(), '../../.env') });

const ADMIN_DATABASE = 'postgres';
const SOCIAL_DATABASE = 'equa_social';

export interface SocialDatabaseConnection {
  databaseName: string;
  adminConnectionString: string;
}

export function parseSocialDatabaseConnection(connectionString: string): SocialDatabaseConnection {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('SOCIAL_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:')
    throw new Error('SOCIAL_DATABASE_URL must use the postgres:// or postgresql:// scheme.');
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName) throw new Error('SOCIAL_DATABASE_URL must include a database name.');
  if (databaseName !== SOCIAL_DATABASE)
    throw new Error(
      `Refusing to run Social migrations against database "${databaseName}". Set SOCIAL_DATABASE_URL to ${SOCIAL_DATABASE}.`,
    );
  parsed.pathname = `/${ADMIN_DATABASE}`;
  return { databaseName, adminConnectionString: parsed.toString() };
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureSocialDatabase(
  connectionString: string,
  adminConnectionString: string,
): Promise<void> {
  const { databaseName } = parseSocialDatabaseConnection(connectionString);
  const adminClient = new Client({ connectionString: adminConnectionString });
  try {
    await adminClient.connect();
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (exists.rowCount) return;

    const role = await adminClient.query<{ rolcreatedb: boolean }>(
      'SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    if (!role.rows[0]?.rolcreatedb)
      throw new Error(
        `Database "${databaseName}" does not exist and PostgreSQL user lacks CREATEDB permission. Create it with an administrator, then rerun Social migrations.`,
      );
    try {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    } catch (error) {
      if (isPostgresError(error, '42P04')) return;
      if (isPostgresError(error, '42501'))
        throw new Error(
          `Cannot create database "${databaseName}": PostgreSQL user lacks CREATEDB permission. Create it with an administrator, then rerun Social migrations.`,
          { cause: error },
        );
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('lacks CREATEDB permission')) throw error;
    if (isPostgresError(error, '42501'))
      throw new Error(
        `Cannot ensure database "${databaseName}": PostgreSQL user lacks CREATEDB permission or cannot access its configured database.`,
        { cause: error },
      );
    throw error;
  } finally {
    await adminClient.end();
  }
}

async function runMigrations(connectionString: string): Promise<void> {
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

async function main(): Promise<void> {
  const configuredUrl = process.env.SOCIAL_DATABASE_URL;
  if (!configuredUrl) throw new Error('SOCIAL_DATABASE_URL must be configured.');
  const connectionString = withDatabaseName(configuredUrl, SOCIAL_DATABASE);
  const configuredDatabaseName = decodeURIComponent(new URL(configuredUrl).pathname.slice(1));
  const adminConnectionString =
    configuredDatabaseName === SOCIAL_DATABASE
      ? parseSocialDatabaseConnection(connectionString).adminConnectionString
      : configuredDatabaseName === 'equa_identity'
        ? configuredUrl
        : undefined;
  if (!adminConnectionString)
    throw new Error('SOCIAL_DATABASE_URL must target equa_identity or equa_social.');
  await ensureSocialDatabase(connectionString, adminConnectionString);
  await runMigrations(connectionString);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(__filename).href
)
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
