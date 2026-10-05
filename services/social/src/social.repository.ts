import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '@equa/contracts';

import type {
  FriendRequest,
  Friendship,
  Group,
  GroupInvitation,
  GroupMember,
  GroupType,
  PendingGroupInvitation,
} from './types.js';

export interface ClaimedSocialEvent {
  event: DomainEvent;
  leaseToken: string;
  attempts: number;
}

export interface SocialOutboxStore {
  claimOutbox(now: Date): Promise<ClaimedSocialEvent | undefined>;
  completeOutbox(id: string, leaseToken: string): Promise<void>;
  retryOutbox(
    id: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void>;
}

export interface SocialRepository {
  createFriendRequest(row: FriendRequest): Promise<FriendRequest>;
  findFriendRequest(id: string): Promise<FriendRequest | undefined>;
  findPendingFriendRequest(
    requesterId: string,
    identifier: string,
  ): Promise<FriendRequest | undefined>;
  saveFriendRequest(row: FriendRequest): Promise<void>;
  /** Atomically accepts a request and creates the canonical friendship. */
  acceptFriendRequest(requestId: string, actorId: string, acceptedAt: string): Promise<Friendship>;
  listFriendRequests(userId: string): Promise<FriendRequest[]>;
  findFriendship(userA: string, userB: string): Promise<Friendship | undefined>;
  listFriendships(userId: string): Promise<Friendship[]>;
  saveFriendship(row: Friendship): Promise<void>;
  removeFriendship(userA: string, userB: string): Promise<void>;
  createGroup(row: Group): Promise<void>;
  /** Atomically creates the group and its creator-admin membership. */
  createGroupWithAdmin(group: Group, member: GroupMember): Promise<void>;
  listGroupsForMember(userId: string): Promise<Group[]>;
  findGroup(id: string): Promise<Group | undefined>;
  saveGroup(row: Group): Promise<void>;
  addMember(row: GroupMember): Promise<void>;
  findMember(groupId: string, userId: string): Promise<GroupMember | undefined>;
  listMembers(groupId: string): Promise<GroupMember[]>;
  removeMember(groupId: string, userId: string): Promise<void>;
  createInvitation(row: GroupInvitation): Promise<void>;
  createInvitationWithEvent(row: GroupInvitation, event: DomainEvent): Promise<void>;
  ensureOutboxEvent(event: DomainEvent): Promise<void>;
  listPendingInvitationsForUser(userId: string, email: string): Promise<PendingGroupInvitation[]>;
  findPendingInvitation(
    groupId: string,
    kind: GroupInvitation['kind'],
    identifier?: string,
  ): Promise<GroupInvitation | undefined>;
  findInvitation(id: string): Promise<GroupInvitation | undefined>;
  findInvitationByToken(token: string): Promise<GroupInvitation | undefined>;
  saveInvitation(row: GroupInvitation): Promise<void>;
  declineGroupInvitation(
    invitationId: string,
    actorId: string,
    actorEmail: string,
  ): Promise<GroupInvitation | undefined>;
  /** Atomically accepts an invitation and creates the member row. */
  acceptGroupInvitation(
    invitationId: string,
    actorId: string,
    actorEmail: string,
    joinedAt: string,
    acceptedAt: string,
  ): Promise<GroupMember>;
}

export class InMemorySocialRepository implements SocialRepository, SocialOutboxStore {
  readonly friendRequests = new Map<string, FriendRequest>();
  readonly friendships = new Map<string, Friendship>();
  readonly groups = new Map<string, Group>();
  readonly members = new Map<string, GroupMember>();
  readonly invitations = new Map<string, GroupInvitation>();
  readonly outbox = new Map<string, DomainEvent>();
  private readonly outboxState = new Map<
    string,
    {
      attempts: number;
      availableAt: Date;
      leaseUntil?: Date;
      leaseToken?: string;
      status: 'pending' | 'leased' | 'published' | 'dead';
    }
  >();

  async createFriendRequest(row: FriendRequest): Promise<FriendRequest> {
    const duplicate = [...this.friendRequests.values()].find(
      (existing) =>
        existing.status === 'pending' &&
        ((existing.requesterId === row.requesterId &&
          normalizeIdentifier(existing.targetIdentifier) ===
            normalizeIdentifier(row.targetIdentifier)) ||
          (row.targetUserId !== undefined &&
            existing.targetUserId !== undefined &&
            existing.requesterId === row.targetUserId &&
            existing.targetUserId === row.requesterId)),
    );
    if (duplicate) throw uniqueViolation();
    this.friendRequests.set(row.id, structuredClone(row));
    return Promise.resolve(structuredClone(row));
  }
  findFriendRequest(id: string): Promise<FriendRequest | undefined> {
    return Promise.resolve(this.clone(this.friendRequests.get(id)));
  }
  findPendingFriendRequest(
    requesterId: string,
    identifier: string,
  ): Promise<FriendRequest | undefined> {
    const normalized = normalizeIdentifier(identifier);
    return Promise.resolve(
      [...this.friendRequests.values()].find(
        (row) =>
          row.requesterId === requesterId &&
          row.status === 'pending' &&
          normalizeIdentifier(row.targetIdentifier) === normalized,
      ),
    ).then((row) => this.clone(row));
  }
  saveFriendRequest(row: FriendRequest): Promise<void> {
    this.friendRequests.set(row.id, structuredClone(row));
    return Promise.resolve();
  }
  async acceptFriendRequest(
    requestId: string,
    actorId: string,
    acceptedAt: string,
  ): Promise<Friendship> {
    const request = this.friendRequests.get(requestId);
    if (!request) throw new Error('Friend request was not found.');
    if (request.targetUserId && request.targetUserId !== actorId)
      throw new Error('Friend request is addressed to another identity.');
    if (request.status === 'accepted') {
      const existing = this.friendships.get(friendshipKey(request.requesterId, actorId));
      if (existing) return Promise.resolve(structuredClone(existing));
    }
    if (request.status !== 'pending') throw new Error('Friend request is no longer pending.');
    const existing = this.friendships.get(friendshipKey(request.requesterId, actorId));
    if (existing) {
      request.status = 'accepted';
      request.targetUserId = actorId;
      request.acceptedAt = request.acceptedAt ?? acceptedAt;
      this.friendRequests.set(request.id, structuredClone(request));
      return Promise.resolve(structuredClone(existing));
    }
    const friendship: Friendship = {
      userA: request.requesterId,
      userB: actorId,
      createdAt: request.createdAt,
    };
    this.friendships.set(
      friendshipKey(friendship.userA, friendship.userB),
      structuredClone(friendship),
    );
    request.status = 'accepted';
    request.targetUserId = actorId;
    request.acceptedAt = acceptedAt;
    this.friendRequests.set(request.id, structuredClone(request));
    return Promise.resolve(structuredClone(friendship));
  }
  listFriendRequests(userId: string): Promise<FriendRequest[]> {
    return Promise.resolve(
      [...this.friendRequests.values()]
        .filter((row) => row.requesterId === userId || row.targetUserId === userId)
        .map((row) => structuredClone(row)),
    );
  }
  findFriendship(userA: string, userB: string): Promise<Friendship | undefined> {
    return Promise.resolve(this.clone(this.friendships.get(friendshipKey(userA, userB))));
  }
  listFriendships(userId: string): Promise<Friendship[]> {
    return Promise.resolve(
      [...this.friendships.values()]
        .filter((row) => row.userA === userId || row.userB === userId)
        .map((row) => structuredClone(row)),
    );
  }
  saveFriendship(row: Friendship): Promise<void> {
    this.friendships.set(friendshipKey(row.userA, row.userB), structuredClone(row));
    return Promise.resolve();
  }
  removeFriendship(userA: string, userB: string): Promise<void> {
    this.friendships.delete(friendshipKey(userA, userB));
    return Promise.resolve();
  }
  createGroup(row: Group): Promise<void> {
    this.groups.set(row.id, structuredClone(row));
    return Promise.resolve();
  }
  async createGroupWithAdmin(group: Group, member: GroupMember): Promise<void> {
    if (member.groupId !== group.id) throw new Error('Group member does not belong to the group.');
    if (this.groups.has(group.id) || this.members.has(memberKey(member.groupId, member.userId)))
      throw uniqueViolation();
    this.groups.set(group.id, structuredClone(group));
    this.members.set(memberKey(member.groupId, member.userId), structuredClone(member));
    return Promise.resolve();
  }
  findGroup(id: string): Promise<Group | undefined> {
    return Promise.resolve(this.clone(this.groups.get(id)));
  }
  listGroupsForMember(userId: string): Promise<Group[]> {
    const groups = [...this.members.values()]
      .filter((member) => member.userId === userId)
      .map((member) => this.groups.get(member.groupId))
      .filter((group): group is Group => Boolean(group && !group.dissolvedAt))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
      )
      .map((group) => structuredClone(group));
    return Promise.resolve(groups);
  }
  saveGroup(row: Group): Promise<void> {
    this.groups.set(row.id, structuredClone(row));
    return Promise.resolve();
  }
  addMember(row: GroupMember): Promise<void> {
    if (!this.members.has(memberKey(row.groupId, row.userId)))
      this.members.set(memberKey(row.groupId, row.userId), structuredClone(row));
    return Promise.resolve();
  }
  findMember(groupId: string, userId: string): Promise<GroupMember | undefined> {
    return Promise.resolve(this.clone(this.members.get(memberKey(groupId, userId))));
  }
  listMembers(groupId: string): Promise<GroupMember[]> {
    return Promise.resolve(
      [...this.members.values()]
        .filter((row) => row.groupId === groupId)
        .map((row) => structuredClone(row)),
    );
  }
  removeMember(groupId: string, userId: string): Promise<void> {
    this.members.delete(memberKey(groupId, userId));
    return Promise.resolve();
  }
  async createInvitation(row: GroupInvitation): Promise<void> {
    const normalizedTarget = row.targetIdentifier
      ? normalizeIdentifier(row.targetIdentifier)
      : undefined;
    const duplicate = [...this.invitations.values()].find(
      (existing) =>
        existing.groupId === row.groupId &&
        existing.status === 'pending' &&
        existing.kind === row.kind &&
        (row.kind === 'link' ||
          (normalizedTarget !== undefined &&
            normalizeIdentifier(existing.targetIdentifier ?? '') === normalizedTarget)),
    );
    if (duplicate) throw uniqueViolation();
    this.invitations.set(row.id, structuredClone(row));
    return Promise.resolve();
  }
  async createInvitationWithEvent(row: GroupInvitation, event: DomainEvent): Promise<void> {
    if (event.id !== row.id) throw new Error('Invitation event id must match invitation id.');
    await this.createInvitation(row);
    this.insertOutboxEvent(event);
  }
  ensureOutboxEvent(event: DomainEvent): Promise<void> {
    this.insertOutboxEvent(event);
    return Promise.resolve();
  }
  listPendingInvitationsForUser(userId: string, email: string): Promise<PendingGroupInvitation[]> {
    const normalizedEmail = normalizeIdentifier(email);
    const pending = [...this.invitations.values()]
      .filter(
        (invitation) =>
          invitation.kind === 'email' &&
          invitation.status === 'pending' &&
          (invitation.targetUserId === userId ||
            (invitation.targetUserId === undefined &&
              normalizeIdentifier(invitation.targetEmail ?? '') === normalizedEmail)),
      )
      .flatMap((invitation) => {
        const group = this.groups.get(invitation.groupId);
        if (!group || group.dissolvedAt) return [];
        return [
          {
            invitation: structuredClone(invitation),
            group: { id: group.id, name: group.name, type: group.type },
          },
        ];
      })
      .sort(
        (left, right) =>
          right.invitation.createdAt.localeCompare(left.invitation.createdAt) ||
          left.invitation.id.localeCompare(right.invitation.id),
      );
    return Promise.resolve(pending);
  }
  findPendingInvitation(
    groupId: string,
    kind: GroupInvitation['kind'],
    identifier?: string,
  ): Promise<GroupInvitation | undefined> {
    const normalized = identifier ? normalizeIdentifier(identifier) : undefined;
    return Promise.resolve(
      this.clone(
        [...this.invitations.values()].find(
          (row) =>
            row.groupId === groupId &&
            row.kind === kind &&
            row.status === 'pending' &&
            (kind === 'link' || normalizeIdentifier(row.targetIdentifier ?? '') === normalized),
        ),
      ),
    );
  }
  findInvitation(id: string): Promise<GroupInvitation | undefined> {
    return Promise.resolve(this.clone(this.invitations.get(id)));
  }
  findInvitationByToken(token: string): Promise<GroupInvitation | undefined> {
    return Promise.resolve(
      this.clone([...this.invitations.values()].find((row) => row.token === token)),
    );
  }
  saveInvitation(row: GroupInvitation): Promise<void> {
    this.invitations.set(row.id, structuredClone(row));
    return Promise.resolve();
  }
  declineGroupInvitation(
    invitationId: string,
    actorId: string,
    actorEmail: string,
  ): Promise<GroupInvitation | undefined> {
    const invitation = this.invitations.get(invitationId);
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.kind !== 'email' ||
      !isInvitationRecipient(invitation, actorId, actorEmail)
    )
      return Promise.resolve(undefined);
    invitation.status = 'declined';
    this.invitations.set(invitation.id, structuredClone(invitation));
    return Promise.resolve(structuredClone(invitation));
  }
  async acceptGroupInvitation(
    invitationId: string,
    actorId: string,
    actorEmail: string,
    joinedAt: string,
    acceptedAt: string,
  ): Promise<GroupMember> {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) throw new Error('Invitation was not found.');
    const existing = this.members.get(memberKey(invitation.groupId, actorId));
    if (invitation.kind === 'email' && !isInvitationRecipient(invitation, actorId, actorEmail))
      throw new Error('Invitation is addressed to another identity.');
    if (invitation.status === 'accepted' && existing)
      return Promise.resolve(structuredClone(existing));
    if (invitation.status !== 'pending') throw new Error('Invitation is no longer pending.');
    if (existing) {
      invitation.status = 'accepted';
      invitation.targetUserId = actorId;
      invitation.acceptedAt = acceptedAt;
      this.invitations.set(invitation.id, structuredClone(invitation));
      return Promise.resolve(structuredClone(existing));
    }
    const member: GroupMember = {
      groupId: invitation.groupId,
      userId: actorId,
      role: 'member',
      joinedAt,
    };
    this.members.set(memberKey(member.groupId, member.userId), structuredClone(member));
    invitation.status = 'accepted';
    invitation.targetUserId = actorId;
    invitation.acceptedAt = acceptedAt;
    this.invitations.set(invitation.id, structuredClone(invitation));
    return Promise.resolve(structuredClone(member));
  }

  private clone<T>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : structuredClone(value);
  }

  claimOutbox(now: Date): Promise<ClaimedSocialEvent | undefined> {
    for (const [id, state] of this.outboxState) {
      if (
        state.attempts >= 8 &&
        (state.status === 'pending' ||
          (state.status === 'leased' && state.leaseUntil !== undefined && state.leaseUntil <= now))
      ) {
        state.status = 'dead';
        state.leaseUntil = undefined;
      }
      this.outboxState.set(id, state);
    }
    const candidate = [...this.outbox.entries()]
      .filter(([id]) => {
        const state = this.outboxState.get(id);
        return (
          state !== undefined &&
          state.attempts < 8 &&
          state.availableAt <= now &&
          (state.status === 'pending' ||
            (state.status === 'leased' &&
              state.leaseUntil !== undefined &&
              state.leaseUntil <= now))
        );
      })
      .sort(
        (left, right) =>
          left[1].occurredAt.localeCompare(right[1].occurredAt) || left[0].localeCompare(right[0]),
      )[0];
    if (!candidate) return Promise.resolve(undefined);
    const [id, event] = candidate;
    const state = this.outboxState.get(id)!;
    const leaseToken = randomUUID();
    state.attempts += 1;
    state.status = 'leased';
    state.leaseToken = leaseToken;
    state.leaseUntil = new Date(now.valueOf() + 30_000);
    return Promise.resolve({ event: structuredClone(event), leaseToken, attempts: state.attempts });
  }
  completeOutbox(id: string, leaseToken: string): Promise<void> {
    const state = this.outboxState.get(id);
    if (state?.status === 'leased' && state.leaseToken === leaseToken) {
      state.status = 'published';
      state.leaseUntil = undefined;
      state.leaseToken = undefined;
    }
    return Promise.resolve();
  }
  retryOutbox(
    id: string,
    leaseToken: string,
    _error: string,
    retryAt: Date,
    terminal: boolean,
  ): Promise<void> {
    const state = this.outboxState.get(id);
    if (state?.status === 'leased' && state.leaseToken === leaseToken) {
      state.status = terminal ? 'dead' : 'pending';
      state.availableAt = retryAt;
      state.leaseUntil = undefined;
      state.leaseToken = undefined;
    }
    return Promise.resolve();
  }
  private insertOutboxEvent(event: DomainEvent): void {
    if (this.outbox.has(event.id)) return;
    this.outbox.set(event.id, structuredClone(event));
    this.outboxState.set(event.id, {
      attempts: 0,
      availableAt: new Date(0),
      status: 'pending',
    });
  }
}

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}
export function friendshipKey(userA: string, userB: string): string {
  return [userA, userB].sort().join('\u0000');
}
export function memberKey(groupId: string, userId: string): string {
  return `${groupId}\u0000${userId}`;
}
export function newId(): string {
  return randomUUID();
}
export function validGroupType(value: unknown): value is GroupType {
  return value === 'trip' || value === 'household' || value === 'event' || value === 'other';
}

function uniqueViolation(): Error & { code: string } {
  const error = new Error('A conflicting social record already exists.') as Error & {
    code: string;
  };
  error.code = '23505';
  return error;
}

function isInvitationRecipient(
  invitation: GroupInvitation,
  actorId: string,
  actorEmail: string,
): boolean {
  if (invitation.targetUserId) return invitation.targetUserId === actorId;
  return normalizeIdentifier(invitation.targetEmail ?? '') === normalizeIdentifier(actorEmail);
}
