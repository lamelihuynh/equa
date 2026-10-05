export function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('Ledger database URL must use a PostgreSQL scheme.');
  if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName))
    throw new Error('Ledger database name is invalid.');
  url.pathname = `/${databaseName}`;
  return url.toString();
}
