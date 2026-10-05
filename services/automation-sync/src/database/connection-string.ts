export const AUTOMATION_DATABASE = 'equa_automation_sync';
const ADMIN_DATABASE = 'postgres';
const DEFAULT_DATABASE = 'equa_identity';

export interface AutomationDatabaseConnections {
  databaseName: typeof AUTOMATION_DATABASE;
  connectionString: string;
  adminConnectionString: string;
}

export function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = parsePostgresUrl(connectionString);
  if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName))
    throw new Error('Automation database name is invalid.');
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Accept only the Render default DB URL or this service's explicitly owned DB URL. */
export function automationDatabaseConnections(
  configuredConnectionString: string,
): AutomationDatabaseConnections {
  const parsed = parsePostgresUrl(configuredConnectionString);
  const configuredDatabaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (configuredDatabaseName !== DEFAULT_DATABASE && configuredDatabaseName !== AUTOMATION_DATABASE)
    throw new Error(
      `AUTOMATION_SYNC_DATABASE_URL must target ${DEFAULT_DATABASE} or ${AUTOMATION_DATABASE}.`,
    );

  const connectionString = withDatabaseName(configuredConnectionString, AUTOMATION_DATABASE);
  const adminConnectionString =
    configuredDatabaseName === AUTOMATION_DATABASE
      ? withDatabaseName(configuredConnectionString, ADMIN_DATABASE)
      : configuredConnectionString;
  return { databaseName: AUTOMATION_DATABASE, connectionString, adminConnectionString };
}

export function quoteDatabaseIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier))
    throw new Error('Automation database identifier is invalid.');
  return `"${identifier}"`;
}

function parsePostgresUrl(connectionString: string): URL {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('AUTOMATION_SYNC_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('AUTOMATION_SYNC_DATABASE_URL must use a PostgreSQL scheme.');
  if (!url.pathname.replace(/^\/+/, ''))
    throw new Error('AUTOMATION_SYNC_DATABASE_URL must include a database name.');
  return url;
}
