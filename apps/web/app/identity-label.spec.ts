import { describe, expect, it } from 'vitest';

import { humanIdentityLabel, humanIdentitySecondaryLabel } from './identity-label';

describe('human identity labels', () => {
  it('prefers display name and uses email as secondary text', () => {
    const identity = { displayName: '  Linh  ', email: 'linh@example.test' };
    const label = humanIdentityLabel(identity);
    expect(label).toBe('Linh');
    expect(humanIdentitySecondaryLabel(identity, label)).toBe('linh@example.test');
  });

  it('falls back to email and never uses an identifier as a visible label', () => {
    expect(humanIdentityLabel({ id: 'user-uuid', email: 'member@example.test' })).toBe(
      'member@example.test',
    );
    expect(humanIdentityLabel({ id: 'user-uuid' })).toBe('Người dùng Equa');
  });
});
