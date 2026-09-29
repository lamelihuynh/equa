import { describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../src/audit/audit.service';
import type { IdentityConfigService } from '../src/config/identity-config.service';
import type { DatabaseService } from '../src/database/database.service';
import type { EmailService } from '../src/email/email.service';
import { AuthService } from '../src/auth/auth.service';
import type { TokenService } from '../src/auth/token.service';

describe('AuthService register compatibility', () => {
  it('accepts the legacy displayName/email/password payload without username', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValue({ rowCount: 0, rows: [] });
    const transactionClient = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const database = {
      query,
      transaction: vi.fn(
        async (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
    } as unknown as DatabaseService;
    const tokenService = {
      createId: vi.fn().mockReturnValue('user-id'),
      createOpaqueToken: vi.fn().mockReturnValue('verification-token'),
      hashOpaqueToken: vi.fn().mockReturnValue('verification-token-hash'),
    } as unknown as TokenService;
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const email = { sendVerification } as unknown as EmailService;
    const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const config = { refreshTokenDays: 30 } as IdentityConfigService;
    const service = new AuthService(database, config, tokenService, email, audit);

    const result = await service.register(
      {
        displayName: 'Ti Ky',
        email: 'legacy@example.test',
        password: 'LegacyPassword123!',
      },
      { correlationId: 'legacy-register', ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(result).toEqual({ userId: 'user-id', verificationSent: true });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE email = $1'), [
      'legacy@example.test',
    ]);
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['user-id', 'legacy@example.test', null]),
    );
    expect(sendVerification).toHaveBeenCalledWith('legacy@example.test', 'verification-token');
  });
});
