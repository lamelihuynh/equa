import { randomBytes } from 'node:crypto';
import {
  AUTOMATION_CONTRACT_VERSION,
  GROUP_INVITATION_CREATED_EVENT,
  type GroupInvitationCreatedEvent,
} from '@equa/contracts';

import { SocialError } from './errors.js';
import type { IdentityDirectory } from './identity-adapter.js';
import type { SocialLedgerAdapter } from './ledger-adapter.js';
import {
  friendshipKey,
  memberKey,
  newId,
  normalizeIdentifier,
  validGroupType,
  type SocialRepository,
} from './social.repository.js';
import type {
  FriendRequest,
  Friendship,
  Group,
  GroupInvitation,
  GroupMember,
  GroupType,
  PairBalance,
  FriendshipView,
  FriendRequestView,
  GroupInvitationView,
  GroupMemberView,
  HumanIdentity,
  PendingGroupInvitation,
  SocialUser,
} from './types.js';

export interface AuthenticatedSocialUser {
  id: string;
  email: string;
  username?: string;
}

export interface CreateGroupInput {
  name: string;
  imageUrl?: string | null;
  type: GroupType;
}

export interface InviteInput {
  kind: 'email' | 'link';
  identifier?: string;
}

export class SocialService {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(
    private readonly repository: SocialRepository,
    private readonly identity: IdentityDirectory,
    private readonly ledger: SocialLedgerAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly appWebUrl = 'http://localhost:3000',
  ) {}

  async sendFriendRequest(
    actor: AuthenticatedSocialUser,
    identifier: string,
  ): Promise<FriendRequest> {
    return this.withLock(`friend-request:${actor.id}:${normalizeIdentifier(identifier)}`, () =>
      this.sendFriendRequestUnlocked(actor, identifier),
    );
  }

  private async sendFriendRequestUnlocked(
    actor: AuthenticatedSocialUser,
    identifier: string,
  ): Promise<FriendRequest> {
    // Identifiers are case-insensitive for both email and username. Persisting
    // the normalized form also makes the database uniqueness guard agree with
    // the in-memory repository and prevents duplicate requests such as
    // `Bob`/`bob`.
    const targetIdentifier = normalizeIdentifier(identifier);
    if (!targetIdentifier) throw new SocialError('INVALID_IDENTIFIER', 'Identifier is required.');
    const resolved = await this.identityCall(() =>
      this.identity.resolveIdentifier(targetIdentifier),
    );
    // An email can be accepted later from a verified JWT email claim. A
    // username has no equivalent proof if Identity could not resolve it, so
    // retaining it as a pending request would make the request permanently
    // unacceptible.
    if (!resolved && !isEmail(targetIdentifier))
      throw new SocialError('IDENTITY_NOT_FOUND', 'The username was not found.', 404);
    if (resolved?.id === actor.id)
      throw new SocialError('SELF_FRIEND_REQUEST', 'You cannot add yourself.');
    if (resolved && (await this.repository.findFriendship(actor.id, resolved.id)))
      throw new SocialError('FRIEND_ALREADY_EXISTS', 'You are already friends.', 409);
    const duplicate = await this.repository.findPendingFriendRequest(actor.id, targetIdentifier);
    if (duplicate) return duplicate;
    if (resolved) {
      const reverse = (await this.repository.listFriendRequests(actor.id)).find(
        (row) => row.requesterId === resolved.id && row.status === 'pending',
      );
      if (reverse) return reverse;
    }
    const row: FriendRequest = {
      id: newId(),
      requesterId: actor.id,
      targetUserId: resolved?.id,
      targetIdentifier,
      targetEmail:
        (resolved?.email ? normalizeIdentifier(resolved.email) : undefined) ??
        (isEmail(targetIdentifier) ? normalizeIdentifier(targetIdentifier) : undefined),
      status: 'pending',
      createdAt: this.now().toISOString(),
    };
    try {
      return await this.repository.createFriendRequest(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.repository.findPendingFriendRequest(actor.id, targetIdentifier);
        if (existing) return existing;
        if (resolved) {
          const reverse = (await this.repository.listFriendRequests(actor.id)).find(
            (row) =>
              row.requesterId === resolved.id &&
              row.targetUserId === actor.id &&
              row.status === 'pending',
          );
          if (reverse) return reverse;
        }
      }
      throw error;
    }
  }

  async acceptFriendRequest(
    actor: AuthenticatedSocialUser,
    requestId: string,
  ): Promise<Friendship> {
    return this.withLock(`friend-accept:${requestId}`, () =>
      this.acceptFriendRequestUnlocked(actor, requestId),
    );
  }

  private async acceptFriendRequestUnlocked(
    actor: AuthenticatedSocialUser,
    requestId: string,
  ): Promise<Friendship> {
    const request = await this.repository.findFriendRequest(requestId);
    if (!request)
      throw new SocialError('FRIEND_REQUEST_NOT_FOUND', 'Friend request was not found.', 404);
    if (request.status === 'accepted') {
      const existing = await this.repository.findFriendship(request.requesterId, actor.id);
      if (existing) return existing;
    }
    if (request.status !== 'pending')
      throw new SocialError('FRIEND_REQUEST_CLOSED', 'Friend request is no longer pending.', 409);
    if (request.requesterId === actor.id)
      throw new SocialError('SELF_FRIEND_REQUEST', 'You cannot accept your own request.');
    if (!this.isTarget(request, actor))
      throw new SocialError(
        'FRIEND_REQUEST_FORBIDDEN',
        'This request is addressed to another identity.',
        403,
      );
    const existing = await this.repository.findFriendship(request.requesterId, actor.id);
    if (existing) {
      request.status = 'accepted';
      request.targetUserId = actor.id;
      request.acceptedAt = request.acceptedAt ?? this.now().toISOString();
      await this.repository.saveFriendRequest(request);
      return existing;
    }
    try {
      return await this.repository.acceptFriendRequest(
        request.id,
        actor.id,
        this.now().toISOString(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const retry = await this.repository.findFriendship(request.requesterId, actor.id);
        if (retry) return retry;
      }
      throw error;
    }
  }

  async rejectFriendRequest(actor: AuthenticatedSocialUser, requestId: string): Promise<void> {
    const request = await this.repository.findFriendRequest(requestId);
    if (!request)
      throw new SocialError('FRIEND_REQUEST_NOT_FOUND', 'Friend request was not found.', 404);
    if (request.requesterId !== actor.id && !this.isTarget(request, actor))
      throw new SocialError('FRIEND_REQUEST_FORBIDDEN', 'You cannot reject this request.', 403);
    if (request.status === 'pending') {
      request.status = 'rejected';
      await this.repository.saveFriendRequest(request);
    }
  }

  async listFriendRequests(actor: AuthenticatedSocialUser): Promise<FriendRequestView[]> {
    const requests = await this.repository.listFriendRequests(actor.id);
    const profiles = await this.resolveProfiles([
      actor.id,
      ...requests.flatMap((request) => [request.requesterId, request.targetUserId ?? '']),
    ]);
    const currentUser = profiles.get(actor.id) ?? { id: actor.id, email: actor.email };
    return requests.map((request) => {
      const target: HumanIdentity | undefined = request.targetUserId
        ? (profiles.get(request.targetUserId) ?? { id: request.targetUserId })
        : normalizeIdentifier(request.targetEmail ?? '') === normalizeIdentifier(actor.email)
          ? currentUser
          : request.targetEmail
            ? { email: request.targetEmail }
            : request.targetIdentifier
              ? { username: request.targetIdentifier }
              : undefined;
      return {
        ...request,
        requester: profiles.get(request.requesterId) ?? { id: request.requesterId },
        ...(target ? { target } : {}),
      };
    });
  }

  async removeFriend(actor: AuthenticatedSocialUser, friendId: string): Promise<void> {
    const friendship = await this.repository.findFriendship(actor.id, friendId);
    if (!friendship) throw new SocialError('FRIEND_NOT_FOUND', 'Friendship was not found.', 404);
    if (await this.ledgerCall(() => this.ledger.hasOutstandingDebt(actor.id, friendId)))
      throw new SocialError(
        'OUTSTANDING_DEBT',
        'Friendship cannot be removed while debt is outstanding.',
        409,
      );
    await this.repository.removeFriendship(actor.id, friendId);
  }

  async friendBalance(actor: AuthenticatedSocialUser, friendId: string): Promise<PairBalance> {
    const friendship = await this.repository.findFriendship(actor.id, friendId);
    if (!friendship) throw new SocialError('FRIEND_NOT_FOUND', 'Friendship was not found.', 404);
    return this.ledgerCall(() => this.ledger.pairBalance(actor.id, friendId));
  }

  async createGroup(actor: AuthenticatedSocialUser, input: CreateGroupInput): Promise<Group> {
    if (!input.name.trim()) throw new SocialError('INVALID_GROUP', 'Group name is required.');
    if (!validGroupType(input.type))
      throw new SocialError('INVALID_GROUP_TYPE', 'Group type is invalid.');
    const timestamp = this.now().toISOString();
    const group: Group = {
      id: newId(),
      name: input.name.trim(),
      imageUrl: input.imageUrl?.trim() || null,
      type: input.type,
      createdBy: actor.id,
      dissolvedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const admin: GroupMember = {
      groupId: group.id,
      userId: actor.id,
      role: 'admin',
      joinedAt: timestamp,
    };
    await this.repository.createGroupWithAdmin(group, admin);
    return group;
  }

  async updateGroup(
    actor: AuthenticatedSocialUser,
    groupId: string,
    input: Partial<CreateGroupInput>,
  ): Promise<Group> {
    const group = await this.requireAdmin(actor.id, groupId);
    if (group.dissolvedAt) throw new SocialError('GROUP_DISSOLVED', 'Group is dissolved.', 409);
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new SocialError('INVALID_GROUP', 'Group name is required.');
      group.name = input.name.trim();
    }
    if (input.imageUrl !== undefined) group.imageUrl = input.imageUrl?.trim() || null;
    if (input.type !== undefined) {
      if (!validGroupType(input.type))
        throw new SocialError('INVALID_GROUP_TYPE', 'Group type is invalid.');
      group.type = input.type;
    }
    group.updatedAt = this.now().toISOString();
    await this.repository.saveGroup(group);
    return group;
  }

  async dissolveGroup(actor: AuthenticatedSocialUser, groupId: string): Promise<void> {
    const group = await this.requireAdmin(actor.id, groupId);
    if (!group.dissolvedAt) {
      group.dissolvedAt = this.now().toISOString();
      group.updatedAt = group.dissolvedAt;
      await this.repository.saveGroup(group);
    }
  }

  async inviteToGroup(
    actor: AuthenticatedSocialUser,
    groupId: string,
    input: InviteInput,
  ): Promise<GroupInvitation> {
    const group = await this.requireAdmin(actor.id, groupId);
    if (group.dissolvedAt) throw new SocialError('GROUP_DISSOLVED', 'Group is dissolved.', 409);
    const identifier = input.identifier?.trim();
    if (input.kind === 'email' && (!identifier || !isEmail(identifier)))
      throw new SocialError(
        'INVALID_IDENTIFIER',
        'A valid email is required for an email invitation.',
      );
    if (input.kind === 'link' && identifier)
      throw new SocialError('INVALID_INVITATION', 'Link invitations do not accept an identifier.');
    let targetUserId: string | undefined;
    let targetEmail: string | undefined;
    let targetProfile: SocialUser | undefined;
    if (identifier) {
      const resolved = await this.identityCall(() => this.identity.resolveIdentifier(identifier));
      if (!resolved)
        throw new SocialError('IDENTITY_NOT_FOUND', 'The invited account was not found.', 404);
      targetProfile = resolved;
      targetUserId = resolved.id;
      targetEmail =
        (resolved?.email ? normalizeIdentifier(resolved.email) : undefined) ??
        (isEmail(identifier) ? normalizeIdentifier(identifier) : undefined);
      if (targetUserId === actor.id)
        throw new SocialError('SELF_INVITATION', 'You cannot invite yourself.');
      if (targetUserId && (await this.repository.findMember(group.id, targetUserId)))
        throw new SocialError('GROUP_MEMBER_EXISTS', 'User is already a group member.', 409);
    }
    const existing = await this.repository.findPendingInvitation(group.id, input.kind, identifier);
    if (existing) {
      if (input.kind === 'email' && targetProfile && targetEmail)
        await this.repository.ensureOutboxEvent(
          await this.invitationCreatedEvent(existing, group, actor, targetProfile, targetEmail),
        );
      return existing;
    }
    const invitation: GroupInvitation = {
      id: newId(),
      groupId: group.id,
      inviterId: actor.id,
      kind: input.kind,
      targetIdentifier: identifier,
      targetEmail,
      targetUserId,
      token: input.kind === 'link' ? randomBytes(32).toString('base64url') : undefined,
      status: 'pending',
      createdAt: this.now().toISOString(),
    };
    try {
      if (input.kind === 'email' && targetProfile && targetEmail) {
        const event = await this.invitationCreatedEvent(
          invitation,
          group,
          actor,
          targetProfile,
          targetEmail,
        );
        await this.repository.createInvitationWithEvent(invitation, event);
      } else {
        await this.repository.createInvitation(invitation);
      }
      return invitation;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.repository.findPendingInvitation(
          group.id,
          input.kind,
          identifier,
        );
        if (existing) {
          if (input.kind === 'email' && targetProfile && targetEmail)
            await this.repository.ensureOutboxEvent(
              await this.invitationCreatedEvent(existing, group, actor, targetProfile, targetEmail),
            );
          return existing;
        }
      }
      throw error;
    }
  }

  async acceptGroupInvitation(
    actor: AuthenticatedSocialUser,
    invitationIdOrToken: string,
  ): Promise<GroupMember> {
    const invitation =
      (await this.repository.findInvitation(invitationIdOrToken)) ??
      (await this.repository.findInvitationByToken(invitationIdOrToken));
    if (!invitation)
      throw new SocialError('GROUP_INVITATION_NOT_FOUND', 'Invitation was not found.', 404);
    if (invitation.kind === 'link' && invitation.token !== invitationIdOrToken)
      throw new SocialError(
        'GROUP_INVITATION_FORBIDDEN',
        'A valid invitation link is required.',
        403,
      );
    if (invitation.kind === 'email' && !isInvitationRecipient(invitation, actor.id, actor.email))
      throw new SocialError(
        'GROUP_INVITATION_FORBIDDEN',
        'This invitation is addressed to another identity.',
        403,
      );
    if (invitation.status === 'accepted') {
      const existing = await this.repository.findMember(invitation.groupId, actor.id);
      if (existing) return existing;
    }
    if (invitation.status !== 'pending')
      throw new SocialError('GROUP_INVITATION_CLOSED', 'Invitation is no longer pending.', 409);
    const group = await this.repository.findGroup(invitation.groupId);
    if (!group || group.dissolvedAt)
      throw new SocialError('GROUP_DISSOLVED', 'Group is unavailable.', 409);
    const existing = await this.repository.findMember(group.id, actor.id);
    if (existing) return existing;
    return this.repository.acceptGroupInvitation(
      invitation.id,
      actor.id,
      actor.email,
      this.now().toISOString(),
      this.now().toISOString(),
    );
  }

  async declineGroupInvitation(
    actor: AuthenticatedSocialUser,
    invitationId: string,
  ): Promise<GroupInvitation> {
    const invitation = await this.repository.findInvitation(invitationId);
    if (!invitation)
      throw new SocialError('GROUP_INVITATION_NOT_FOUND', 'Invitation was not found.', 404);
    if (invitation.kind !== 'email' || !isInvitationRecipient(invitation, actor.id, actor.email))
      throw new SocialError(
        'GROUP_INVITATION_FORBIDDEN',
        'This invitation is addressed to another identity.',
        403,
      );
    if (invitation.status === 'declined') return invitation;
    if (invitation.status !== 'pending')
      throw new SocialError('GROUP_INVITATION_CLOSED', 'Invitation is no longer pending.', 409);
    const declined = await this.repository.declineGroupInvitation(
      invitation.id,
      actor.id,
      actor.email,
    );
    if (declined) return declined;
    const current = await this.repository.findInvitation(invitation.id);
    if (current?.status === 'declined') return current;
    throw new SocialError('GROUP_INVITATION_CLOSED', 'Invitation is no longer pending.', 409);
  }

  async listPendingGroupInvitations(
    actor: AuthenticatedSocialUser,
  ): Promise<GroupInvitationView[]> {
    const rows = await this.repository.listPendingInvitationsForUser(actor.id, actor.email);
    const profiles = await this.resolveProfiles(rows.map(({ invitation }) => invitation.inviterId));
    return rows.map(({ invitation, group }: PendingGroupInvitation) => ({
      ...invitation,
      group,
      inviter: profiles.get(invitation.inviterId) ?? { id: invitation.inviterId },
    }));
  }

  async listGroupMembers(
    actor: AuthenticatedSocialUser,
    groupId: string,
  ): Promise<GroupMemberView[]> {
    await this.requireMember(actor.id, groupId);
    const members = await this.repository.listMembers(groupId);
    const profiles = await this.resolveProfiles(members.map((member) => member.userId));
    return members.map((member) => ({
      ...member,
      user: profiles.get(member.userId) ?? { id: member.userId },
    }));
  }

  async listGroups(actor: AuthenticatedSocialUser): Promise<Group[]> {
    return this.repository.listGroupsForMember(actor.id);
  }

  async getGroup(actor: AuthenticatedSocialUser, groupId: string): Promise<Group> {
    await this.requireMember(actor.id, groupId);
    const group = await this.repository.findGroup(groupId);
    if (!group) throw new SocialError('GROUP_NOT_FOUND', 'Group was not found.', 404);
    return group;
  }

  async removeGroupMember(
    actor: AuthenticatedSocialUser,
    groupId: string,
    userId: string,
  ): Promise<void> {
    await this.requireAdmin(actor.id, groupId);
    if (actor.id === userId)
      throw new SocialError('INVALID_MEMBER_REMOVAL', 'An admin cannot remove themself.');
    const member = await this.repository.findMember(groupId, userId);
    if (!member)
      throw new SocialError('GROUP_MEMBER_NOT_FOUND', 'Group member was not found.', 404);
    if (await this.ledgerCall(() => this.ledger.hasOutstandingGroupDebt(groupId, userId)))
      throw new SocialError(
        'OUTSTANDING_DEBT',
        'Member cannot be removed while group debt is outstanding.',
        409,
      );
    await this.repository.removeMember(groupId, userId);
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const group = await this.repository.findGroup(groupId);
    if (!group || group.dissolvedAt) return false;
    return Boolean(await this.repository.findMember(groupId, userId));
  }

  async isAdmin(groupId: string, userId: string): Promise<boolean> {
    const group = await this.repository.findGroup(groupId);
    if (!group || group.dissolvedAt) return false;
    const member = await this.repository.findMember(groupId, userId);
    return member?.role === 'admin';
  }

  async isFriend(userA: string, userB: string): Promise<boolean> {
    return Boolean(await this.repository.findFriendship(userA, userB));
  }

  async listFriends(actor: AuthenticatedSocialUser): Promise<FriendshipView[]> {
    const friendships = await this.repository.listFriendships(actor.id);
    const friendIds = friendships.map((friendship) =>
      friendship.userA === actor.id ? friendship.userB : friendship.userA,
    );
    const profiles = await this.resolveProfiles(friendIds);
    return friendships.map((friendship) => {
      const friendId = friendship.userA === actor.id ? friendship.userB : friendship.userA;
      return { ...friendship, friend: profiles.get(friendId) ?? { id: friendId } };
    });
  }

  private async requireMember(userId: string, groupId: string): Promise<Group> {
    const group = await this.repository.findGroup(groupId);
    if (!group) throw new SocialError('GROUP_NOT_FOUND', 'Group was not found.', 404);
    if (group.dissolvedAt) throw new SocialError('GROUP_DISSOLVED', 'Group is dissolved.', 409);
    if (!(await this.repository.findMember(groupId, userId)))
      throw new SocialError('GROUP_FORBIDDEN', 'You are not a member of this group.', 403);
    return group;
  }

  private async requireAdmin(userId: string, groupId: string): Promise<Group> {
    const group = await this.requireMember(userId, groupId);
    const member = await this.repository.findMember(groupId, userId);
    if (!member || member.role !== 'admin')
      throw new SocialError('GROUP_ADMIN_REQUIRED', 'Group admin permission is required.', 403);
    return group;
  }

  private isTarget(request: FriendRequest, actor: AuthenticatedSocialUser): boolean {
    if (request.targetUserId) return request.targetUserId === actor.id;
    return Boolean(
      request.targetEmail &&
      normalizeIdentifier(request.targetEmail) === normalizeIdentifier(actor.email),
    );
  }

  private async ledgerCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SocialError) throw error;
      throw new SocialError(
        'LEDGER_UNAVAILABLE',
        error instanceof Error ? error.message : 'Ledger is unavailable.',
        503,
      );
    }
  }

  private async identityCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SocialError) throw error;
      throw new SocialError(
        'IDENTITY_UNAVAILABLE',
        error instanceof Error ? error.message : 'Identity is unavailable.',
        503,
      );
    }
  }

  private async resolveProfiles(userIds: readonly string[]): Promise<Map<string, SocialUser>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const profiles = new Map<string, SocialUser>();
    for (let start = 0; start < ids.length; start += 100) {
      try {
        for (const profile of await this.identity.resolveUsers(ids.slice(start, start + 100)))
          profiles.set(profile.id, profile);
      } catch {
        // Identity is display enrichment; a directory outage must not hide Social-owned records.
      }
    }
    return profiles;
  }

  private async invitationCreatedEvent(
    invitation: GroupInvitation,
    group: Group,
    actor: AuthenticatedSocialUser,
    recipient: SocialUser,
    recipientEmail: string,
  ): Promise<GroupInvitationCreatedEvent> {
    if (!invitation.targetUserId)
      throw new SocialError('IDENTITY_NOT_FOUND', 'The invited account was not found.', 404);
    const inviter = (await this.resolveProfiles([actor.id])).get(actor.id);
    const inviterEmail = inviter?.email ?? actor.email;
    return {
      version: AUTOMATION_CONTRACT_VERSION,
      id: invitation.id,
      type: GROUP_INVITATION_CREATED_EVENT,
      occurredAt: invitation.createdAt,
      ownerId: invitation.targetUserId,
      producer: 'social',
      payload: {
        invitationId: invitation.id,
        groupId: group.id,
        groupName: group.name,
        groupType: group.type,
        inviterName: inviter?.displayName?.trim() || inviterEmail,
        inviterEmail,
        recipientEmail: recipient.email ?? recipientEmail,
        appUrl: new URL('/groups', this.appWebUrl).toString(),
      },
    };
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isInvitationRecipient(
  invitation: GroupInvitation,
  actorId: string,
  actorEmail: string,
): boolean {
  if (invitation.targetUserId) return invitation.targetUserId === actorId;
  return normalizeIdentifier(invitation.targetEmail ?? '') === normalizeIdentifier(actorEmail);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export { friendshipKey, memberKey };
