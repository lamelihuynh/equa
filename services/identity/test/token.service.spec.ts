import { describe, expect, it } from 'vitest';

import { TokenService } from '../src/auth/token.service';
import { IdentityConfigService } from '../src/config/identity-config.service';

describe('TokenService', () => {
  it('signs and verifies an access token', async () => {
    const original = { ...process.env };
    process.env.IDENTITY_JWT_SECRET = 'a-local-test-secret-that-is-long-enough-for-hmac';
    const service = new TokenService(new IdentityConfigService());
    const token = await service.signAccessToken({
      sub: 'user-1',
      email: 'a@equa.test',
      roles: ['User'],
    });
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      sub: 'user-1',
      roles: ['User'],
    });
    process.env = original;
  });

  it('hashes opaque tokens deterministically without returning raw token', () => {
    const service = new TokenService(new IdentityConfigService());
    expect(service.hashOpaqueToken('raw-token')).toHaveLength(64);
    expect(service.hashOpaqueToken('raw-token')).not.toBe('raw-token');
  });
});
