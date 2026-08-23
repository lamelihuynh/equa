import { describe, expect, it } from 'vitest';

import { assertPasswordPolicy } from '../src/auth/password-policy';

describe('password policy', () => {
  it('accepts a password with upper, lower and digit', () => {
    expect(() => assertPasswordPolicy('SafePassword9')).not.toThrow();
  });

  it('rejects a weak password', () => {
    expect(() => assertPasswordPolicy('weak')).toThrow(/Password must/);
  });
});
