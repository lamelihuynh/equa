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
      rows: [
        {
          id: 'bob-id',
          email: 'bob@example.test',
          username: 'bob',
          display_name: 'Bob Example',
        },
      ],
    });
    const database = { query } as unknown as DatabaseService;
    const config = { serviceKey: 'identity-social-key' } as IdentityConfigService;
    const controller = new IdentityController(database, config);

    await expect(controller.resolve(' Bob ', 'identity-social-key')).resolves.toEqual({
      id: 'bob-id',
      displayName: 'Bob Example',
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

  it('batch-resolves active users with display names behind the service key', async () => {
    const firstId = '00000000-0000-4000-8000-000000000001';
    const secondId = '00000000-0000-4000-8000-000000000002';
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: firstId, email: 'bob@example.test', username: 'bob', display_name: 'Bob' },
        { id: secondId, email: 'lee@example.test', username: null, display_name: 'Lee' },
      ],
    });
    const controller = new IdentityController(
      { query } as unknown as DatabaseService,
      { serviceKey: 'identity-social-key' } as IdentityConfigService,
    );

    await expect(
      controller.resolveMany({ ids: [firstId, firstId, secondId] }, 'identity-social-key'),
    ).resolves.toEqual([
      { id: firstId, displayName: 'Bob', email: 'bob@example.test' },
      { id: secondId, displayName: 'Lee', email: 'lee@example.test' },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ANY($1::uuid[])'), [
      [firstId, secondId],
    ]);

    await expect(controller.resolveMany({ ids: [firstId] }, 'wrong-key')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      controller.resolveMany({ ids: ['not-a-uuid'] }, 'identity-social-key'),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});
