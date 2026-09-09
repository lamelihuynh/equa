import { randomBytes } from 'node:crypto';

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

  async listFriendRequests(actor: AuthenticatedSocialUser): Promise<FriendRequest[]> {
    return this.repository.listFriendRequests(actor.id);
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
    const group = await this.requireMember(actor.id, groupId);
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
    if (identifier) {
      const resolved = await this.identityCall(() => this.identity.resolveIdentifier(identifier));
      targetUserId = resolved?.id;
      targetEmail =
        (resolved?.email ? normalizeIdentifier(resolved.email) : undefined) ??
        (isEmail(identifier) ? normalizeIdentifier(identifier) : undefined);
      if (targetUserId === actor.id)
        throw new SocialError('SELF_INVITATION', 'You cannot invite yourself.');
      if (targetUserId && (await this.repository.findMember(group.id, targetUserId)))
        throw new SocialError('GROUP_MEMBER_EXISTS', 'User is already a group member.', 409);
    }
    const existing = await this.repository.findPendingInvitation(group.id, input.kind, identifier);
    if (existing) return existing;
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
      await this.repository.createInvitation(invitation);
      return invitation;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.repository.findPendingInvitation(
          group.id,
          input.kind,
          identifier,
        );
        if (existing) return existing;
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
    if (invitation.status === 'accepted') {
      const existing = await this.repository.findMember(invitation.groupId, actor.id);
      if (existing) return existing;
    }
    if (invitation.status !== 'pending')
      throw new SocialError('GROUP_INVITATION_CLOSED', 'Invitation is no longer pending.', 409);
    if (
      invitation.kind === 'email' &&
      normalizeIdentifier(invitation.targetEmail ?? '') !== normalizeIdentifier(actor.email)
    )
      throw new SocialError(
        'GROUP_INVITATION_FORBIDDEN',
        'This invitation is addressed to another identity.',
        403,
      );
    if (
      invitation.kind === 'email' &&
      invitation.targetUserId &&
      invitation.targetUserId !== actor.id
    )
      throw new SocialError(
        'GROUP_INVITATION_FORBIDDEN',
        'This invitation is addressed to another identity.',
        403,
      );
    const group = await this.repository.findGroup(invitation.groupId);
    if (!group || group.dissolvedAt)
      throw new SocialError('GROUP_DISSOLVED', 'Group is unavailable.', 409);
    const existing = await this.repository.findMember(group.id, actor.id);
    if (existing) return existing;
    return this.repository.acceptGroupInvitation(
      invitation.id,
      actor.id,
      this.now().toISOString(),
      this.now().toISOString(),
    );
  }

  async listGroupMembers(actor: AuthenticatedSocialUser, groupId: string): Promise<GroupMember[]> {
    await this.requireMember(actor.id, groupId);
    return this.repository.listMembers(groupId);
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

  async listFriends(actor: AuthenticatedSocialUser): Promise<Friendship[]> {
    return this.repository.listFriendships(actor.id);
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export { friendshipKey, memberKey };
