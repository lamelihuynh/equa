import { describe, expect, it, vi } from 'vitest';

import type { IdentityConfigService } from '../src/config/identity-config.service';
import { AvatarService } from '../src/profile/avatar.service';

describe('AvatarService optional staging storage', () => {
  it('starts without S3 credentials and rejects only avatar operations when disabled', async () => {
    const service = new AvatarService({ avatarStorageEnabled: false } as IdentityConfigService);
    const toBuffer = vi.fn<() => Promise<Buffer>>();

    await expect(
      service.upload('user-1', { mimetype: 'image/png', toBuffer }),
    ).rejects.toMatchObject({
      code: 'PROFILE_AVATAR_STORAGE_DISABLED',
    });
    await expect(service.readUrl('avatars/user-1/avatar.png')).rejects.toMatchObject({
      code: 'PROFILE_AVATAR_STORAGE_DISABLED',
    });
    expect(toBuffer).not.toHaveBeenCalled();
  });
});
