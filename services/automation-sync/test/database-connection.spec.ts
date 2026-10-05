import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_DATABASE,
  automationDatabaseConnections,
  withDatabaseName,
} from '../src/database/connection-string.js';

const defaultUrl = 'postgresql://tester:pass@example.test:5432/equa_identity?sslmode=require';

describe('Automation database ownership connection', () => {
  it('targets equa_automation_sync from the Render default database reference', () => {
    const connection = automationDatabaseConnections(defaultUrl);
    expect(connection.databaseName).toBe(AUTOMATION_DATABASE);
    expect(new URL(connection.connectionString).pathname).toBe('/equa_automation_sync');
    expect(connection.adminConnectionString).toBe(defaultUrl);
  });

  it('uses the postgres admin database when configured with its owned database', () => {
    const ownedUrl = withDatabaseName(defaultUrl, AUTOMATION_DATABASE);
    const connection = automationDatabaseConnections(ownedUrl);
    expect(new URL(connection.connectionString).pathname).toBe('/equa_automation_sync');
    expect(new URL(connection.adminConnectionString).pathname).toBe('/postgres');
  });

  it('rejects a URL that belongs to another service', () => {
    const socialUrl = withDatabaseName(defaultUrl, 'equa_social');
    expect(() => automationDatabaseConnections(socialUrl)).toThrow('must target equa_identity');
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => withDatabaseName('https://db.example.test', AUTOMATION_DATABASE)).toThrow(
      'must use a PostgreSQL scheme',
    );
  });
});
