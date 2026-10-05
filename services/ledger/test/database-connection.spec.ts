import { describe, expect, it } from 'vitest';

import { withDatabaseName } from '../src/database/connection-string.js';

describe('Ledger database URL', () => {
  it('targets the Ledger-owned database while preserving connection options', () => {
    const url = withDatabaseName(
      'postgresql://equa:pass%40word@database.internal:5432/equa_identity?sslmode=require',
      'equa_ledger',
    );

    expect(new URL(url).pathname).toBe('/equa_ledger');
    expect(new URL(url).searchParams.get('sslmode')).toBe('require');
  });

  it('rejects invalid database names', () => {
    expect(() =>
      withDatabaseName('postgresql://equa:secret@database:5432/equa', 'ledger;DROP'),
    ).toThrow('Ledger database name is invalid.');
  });
});
