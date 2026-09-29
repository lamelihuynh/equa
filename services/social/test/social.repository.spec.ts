import { describe, expect, it } from 'vitest';

import { InMemorySocialRepository } from '../src/social.repository.js';

describe('InMemorySocialRepository atomic operations', () => {
  it('does not leave a partial group when creator membership is invalid', async () => {
    const repository = new InMemorySocialRepository();
    await expect(
      repository.createGroupWithAdmin(
        {
          id: 'group-1',
          name: 'Trip',
          imageUrl: null,
          type: 'trip',
          createdBy: 'alice',
          dissolvedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          groupId: 'wrong-group',
          userId: 'alice',
          role: 'admin',
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ),
    ).rejects.toThrow();
    expect(repository.groups.size).toBe(0);
    expect(repository.members.size).toBe(0);
  });

  it('returns canonical rows for repeated friend and invitation acceptance', async () => {
    const repository = new InMemorySocialRepository();
    await repository.createFriendRequest({
      id: 'request-1',
      requesterId: 'alice',
      targetUserId: 'bob',
      targetIdentifier: 'bob',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const friendship = await repository.acceptFriendRequest(
      'request-1',
      'bob',
      '2026-01-01T00:01:00.000Z',
    );
    expect(
      await repository.acceptFriendRequest('request-1', 'bob', '2026-01-01T00:02:00.000Z'),
    ).toEqual(friendship);

    await repository.createGroupWithAdmin(
      {
        id: 'group-1',
        name: 'Trip',
        imageUrl: null,
        type: 'trip',
        createdBy: 'alice',
        dissolvedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        groupId: 'group-1',
        userId: 'alice',
        role: 'admin',
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    await repository.createInvitation({
      id: 'invite-1',
      groupId: 'group-1',
      inviterId: 'alice',
      kind: 'link',
      token: 'token-1',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const member = await repository.acceptGroupInvitation(
      'invite-1',
      'bob',
      '2026-01-01T00:01:00.000Z',
      '2026-01-01T00:01:00.000Z',
    );
    expect(
      await repository.acceptGroupInvitation(
        'invite-1',
        'bob',
        '2026-01-01T00:02:00.000Z',
        '2026-01-01T00:02:00.000Z',
      ),
    ).toEqual(member);
  });
});
