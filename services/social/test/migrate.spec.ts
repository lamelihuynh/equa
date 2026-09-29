import { describe, expect, it } from 'vitest';

import { parseSocialDatabaseConnection, quoteIdentifier } from '../src/database/migrate.js';

describe('Social database migration setup', () => {
  it('derives an admin connection without changing credentials or connection options', () => {
    const connection = parseSocialDatabaseConnection(
      'postgresql://social:p%40ss@localhost:15432/equa_social?sslmode=require',
    );

    expect(connection.databaseName).toBe('equa_social');
    expect(connection.adminConnectionString).toBe(
      'postgresql://social:p%40ss@localhost:15432/postgres?sslmode=require',
    );
  });

  it('rejects every database except its own before any PostgreSQL connection', () => {
    for (const database of [
      'equa_identity',
      'equa_ledger',
      'equa_notification',
      'equa_automation_sync',
      'equa_platform',
      'postgres',
    ]) {
      expect(() =>
        parseSocialDatabaseConnection(`postgres://user:pass@localhost/${database}`),
      ).toThrow('Set SOCIAL_DATABASE_URL to equa_social');
    }
  });

  it('quotes database identifiers safely for CREATE DATABASE', () => {
    expect(quoteIdentifier('equa_social')).toBe('"equa_social"');
    expect(quoteIdentifier('social"test')).toBe('"social""test"');
  });
});
