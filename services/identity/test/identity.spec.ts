import { describe, expect, it, vi } from 'vitest';

import type { IdentityConfigService } from '../src/config/identity-config.service';
import type { DatabaseService } from '../src/database/database.service';
import { IdentityController } from '../src/identity/identity.controller';

describe('internal identity resolver', () => {
  it('requires the service key and does not expose lookup results publicly', async () => {
    const query = vi.fn();
    const database = { query } as unknown as DatabaseService;
    const config = { serviceKey: 'identity-social-key' } as IdentityConfigService;
    const controller = new IdentityController(database, config);

    await expect(controller.resolve('bob', undefined)).rejects.toMatchObject({ status: 403 });
    await expect(controller.resolve('bob', 'wrong-key')).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves active email or username and distinguishes not found', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'bob-id', email: 'bob@example.test', username: 'bob' }],
    });
    const database = { query } as unknown as DatabaseService;
    const config = { serviceKey: 'identity-social-key' } as IdentityConfigService;
    const controller = new IdentityController(database, config);

    await expect(controller.resolve(' Bob ', 'identity-social-key')).resolves.toEqual({
      id: 'bob-id',
      email: 'bob@example.test',
      username: 'bob',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['bob']);

    query.mockResolvedValue({ rows: [] });
    await expect(controller.resolve('missing', 'identity-social-key')).rejects.toMatchObject({
      status: 404,
    });
    await expect(controller.resolve(undefined, 'identity-social-key')).rejects.toMatchObject({
      status: 404,
    });
  });
});
