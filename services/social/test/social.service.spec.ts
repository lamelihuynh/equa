import { describe, expect, it, vi } from 'vitest';

import { SocialError } from '../src/errors.js';
import { InMemorySocialRepository } from '../src/social.repository.js';
import { SocialService } from '../src/social.service.js';
import { IdentityLookupUnavailableError, type IdentityDirectory } from '../src/identity-adapter.js';
import type { SocialLedgerAdapter } from '../src/ledger-adapter.js';

const alice = { id: 'alice', email: 'alice@example.test' };
const bob = { id: 'bob', email: 'bob@example.test' };
const resolved = <T>(value: T): Promise<T> => Promise.resolve(value);

describe('SocialService friend lifecycle', () => {
  it('creates, accepts, and idempotently repeats a request', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = { resolveIdentifier: () => resolved(bob) };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const service = new SocialService(repository, identity, ledger);
    const request = await service.sendFriendRequest(alice, 'bob@example.test');
    expect(await service.sendFriendRequest(alice, 'bob@example.test')).toEqual(request);
    expect(await service.acceptFriendRequest(bob, request.id)).toMatchObject({
      userA: 'alice',
      userB: 'bob',
    });
    expect(await service.acceptFriendRequest(bob, request.id)).toMatchObject({
      userA: 'alice',
      userB: 'bob',
    });
  });

  it('rejects self requests and gates removal on Ledger debt', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = {
      resolveIdentifier: (identifier) => resolved(identifier.includes('alice') ? alice : bob),
    };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '1',
          currency: 'VND',
          hasOutstandingDebt: true,
        }),
      hasOutstandingDebt: () => resolved(true),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const service = new SocialService(repository, identity, ledger);
    await expect(service.sendFriendRequest(alice, 'alice@example.test')).rejects.toMatchObject({
      code: 'SELF_FRIEND_REQUEST',
    });
    const request = await service.sendFriendRequest(alice, 'bob@example.test');
    await service.acceptFriendRequest(bob, request.id);
    await expect(service.removeFriend(alice, bob.id)).rejects.toMatchObject({
      code: 'OUTSTANDING_DEBT',
    });
  });

  it('resolves usernames and rejects an unavailable username lookup explicitly', async () => {
    const repository = new InMemorySocialRepository();
    const ledger: SocialLedgerAdapter = {
      pairBalance: () => Promise.reject(new Error('unused')),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const service = new SocialService(
      repository,
      { resolveIdentifier: (value) => resolved(value === 'bob' ? bob : undefined) },
      ledger,
    );
    const request = await service.sendFriendRequest(alice, ' Bob ');
    expect(request).toMatchObject({ targetUserId: 'bob', targetIdentifier: 'bob' });
    await expect(
      new SocialService(
        repository,
        { resolveIdentifier: () => Promise.reject(new IdentityLookupUnavailableError()) },
        ledger,
      ).sendFriendRequest(alice, 'carol'),
    ).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE', status: 503 });
  });

  it('converges reverse requests and duplicate link invitations across service instances', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = {
      resolveIdentifier: (value) =>
        resolved(
          value === 'alice@example.test' ? alice : value === 'bob@example.test' ? bob : undefined,
        ),
    };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const first = new SocialService(repository, identity, ledger);
    const second = new SocialService(repository, identity, ledger);
    const requests = await Promise.all([
      first.sendFriendRequest(alice, bob.email),
      second.sendFriendRequest(bob, alice.email),
    ]);
    expect(new Set(requests.map((request) => request.id)).size).toBe(1);
    expect(repository.friendRequests.size).toBe(1);

    const group = await first.createGroup(alice, { name: 'Trip', type: 'trip' });
    const invitations = await Promise.all([
      first.inviteToGroup(alice, group.id, { kind: 'link' }),
      second.inviteToGroup(alice, group.id, { kind: 'link' }),
    ]);
    expect(new Set(invitations.map((invitation) => invitation.id)).size).toBe(1);
    expect(repository.invitations.size).toBe(1);
  });

  it('returns the pair balance through Ledger and permits zero-debt removal', async () => {
    const repository = new InMemorySocialRepository();
    const pairBalance = vi.fn().mockResolvedValue({
      userId: 'alice',
      counterpartyId: 'bob',
      netMinor: '-1250',
      currency: 'VND',
      hasOutstandingDebt: true,
    });
    const ledger: SocialLedgerAdapter = {
      pairBalance,
      hasOutstandingDebt: vi.fn().mockResolvedValue(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const identity: IdentityDirectory = { resolveIdentifier: () => resolved(bob) };
    const service = new SocialService(repository, identity, ledger);
    const request = await service.sendFriendRequest(alice, bob.email);
    await service.acceptFriendRequest(bob, request.id);
    await expect(service.friendBalance(alice, bob.id)).resolves.toMatchObject({
      netMinor: '-1250',
      currency: 'VND',
    });
    expect(pairBalance).toHaveBeenCalledWith('alice', 'bob');
    await service.removeFriend(alice, bob.id);
    await expect(service.listFriends(alice)).resolves.toEqual([]);
  });
});

describe('SocialService group lifecycle', () => {
  it('makes the creator admin, supports invite acceptance, and authorizes management', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = { resolveIdentifier: () => resolved(bob) };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const service = new SocialService(repository, identity, ledger);
    const group = await service.createGroup(alice, { name: 'Trip', type: 'trip' });
    expect((await service.listGroupMembers(alice, group.id))[0]).toMatchObject({
      userId: 'alice',
      role: 'admin',
    });
    const invitation = await service.inviteToGroup(alice, group.id, {
      kind: 'email',
      identifier: bob.email,
    });
    await service.acceptGroupInvitation(bob, invitation.id);
    expect(
      (await service.listGroupMembers(alice, group.id)).map((member) => member.userId),
    ).toEqual(['alice', 'bob']);
    await expect(service.updateGroup(bob, group.id, { name: 'Nope' })).rejects.toMatchObject({
      code: 'GROUP_ADMIN_REQUIRED',
    });
    await service.updateGroup(alice, group.id, { name: 'Updated', type: 'event' });
    await service.removeGroupMember(alice, group.id, bob.id);
    await service.dissolveGroup(alice, group.id);
  });

  it('rejects invalid types and debt-backed member removal', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = { resolveIdentifier: () => resolved(bob) };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(true),
    };
    const service = new SocialService(repository, identity, ledger);
    await expect(
      service.createGroup(alice, { name: 'bad', type: 'invalid' as never }),
    ).rejects.toBeInstanceOf(SocialError);
    const group = await service.createGroup(alice, { name: 'House', type: 'household' });
    const invite = await service.inviteToGroup(alice, group.id, {
      kind: 'email',
      identifier: bob.email,
    });
    await service.acceptGroupInvitation(bob, invite.id);
    await expect(service.removeGroupMember(alice, group.id, bob.id)).rejects.toMatchObject({
      code: 'OUTSTANDING_DEBT',
    });
  });

  it('supports every group type, link acceptance, and admin-only removal/dissolution', async () => {
    const repository = new InMemorySocialRepository();
    const identity: IdentityDirectory = { resolveIdentifier: () => resolved(bob) };
    const ledger: SocialLedgerAdapter = {
      pairBalance: () =>
        resolved({
          userId: 'alice',
          counterpartyId: 'bob',
          netMinor: '0',
          currency: 'VND',
          hasOutstandingDebt: false,
        }),
      hasOutstandingDebt: () => resolved(false),
      hasOutstandingGroupDebt: () => resolved(false),
    };
    const service = new SocialService(repository, identity, ledger);
    for (const type of ['trip', 'household', 'event', 'other'] as const) {
      const group = await service.createGroup(alice, { name: type, type });
      expect(group.type).toBe(type);
      const invitation = await service.inviteToGroup(alice, group.id, { kind: 'link' });
      expect(invitation.token).toEqual(expect.any(String));
      await service.acceptGroupInvitation(bob, invitation.token!);
      await expect(service.removeGroupMember(bob, group.id, alice.id)).rejects.toMatchObject({
        code: 'GROUP_ADMIN_REQUIRED',
      });
      await expect(service.dissolveGroup(bob, group.id)).rejects.toMatchObject({
        code: 'GROUP_ADMIN_REQUIRED',
      });
      await service.removeGroupMember(alice, group.id, bob.id);
      await service.dissolveGroup(alice, group.id);
    }
  });
});
