import { describe, expect, it } from 'vitest';

import { humanIdentityLabel } from './identity-label';

describe('humanIdentityLabel', () => {
  it('prefers a display name and falls back to email', () => {
    expect(humanIdentityLabel({ displayName: '  Demo B ', email: 'demo-b@example.test' })).toBe(
      'Demo B',
    );
    expect(humanIdentityLabel({ email: 'demo-b@example.test' })).toBe('demo-b@example.test');
  });

  it('uses a username only when display name and email are unavailable', () => {
    expect(humanIdentityLabel({ username: 'demo-b' })).toBe('demo-b');
  });

  it('never falls back to a raw identifier', () => {
    expect(humanIdentityLabel({})).toBe('Người dùng Equa');
  });
});
