import { Pool } from 'pg';

import type { SocialRepository } from '../social.repository.js';
import type { FriendRequest, Friendship, Group, GroupInvitation, GroupMember } from '../types.js';

interface FriendRequestRow {
  id: string;
  requester_id: string;
  target_user_id: string | null;
  target_identifier: string;
  target_email: string | null;
  status: FriendRequest['status'];
  created_at: Date;
  accepted_at: Date | null;
}
interface GroupRow {
  id: string;
  name: string;
  image_url: string | null;
  type: Group['type'];
  created_by: string;
  dissolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
interface MemberRow {
  group_id: string;
  user_id: string;
  role: GroupMember['role'];
  joined_at: Date;
}
interface InvitationRow {
  id: string;
  group_id: string;
  inviter_id: string;
  kind: GroupInvitation['kind'];
  target_identifier: string | null;
  target_email: string | null;
  target_user_id: string | null;
  token: string | null;
  status: GroupInvitation['status'];
  created_at: Date;
  accepted_at: Date | null;
}

export class SocialDatabase implements SocialRepository {
  private readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }
  close(): Promise<void> {
    return this.pool.end();
  }
  async createFriendRequest(row: FriendRequest): Promise<FriendRequest> {
    const result = await this.pool.query<FriendRequestRow>(
      'INSERT INTO friend_requests (id,requester_id,target_user_id,target_identifier,target_email,status,created_at,accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        row.id,
        row.requesterId,
        row.targetUserId ?? null,
        row.targetIdentifier,
        row.targetEmail ?? null,
        row.status,
        row.createdAt,
        row.acceptedAt ?? null,
      ],
    );
    return toFriendRequest(result.rows[0]!);
  }
  async findFriendRequest(id: string): Promise<FriendRequest | undefined> {
    const result = await this.pool.query<FriendRequestRow>(
      'SELECT * FROM friend_requests WHERE id = $1',
      [id],
    );
    return result.rows[0] ? toFriendRequest(result.rows[0]) : undefined;
  }
  async findPendingFriendRequest(
    requesterId: string,
    identifier: string,
  ): Promise<FriendRequest | undefined> {
    const result = await this.pool.query<FriendRequestRow>(
      "SELECT * FROM friend_requests WHERE requester_id = $1 AND lower(target_identifier) = lower($2) AND status = 'pending' LIMIT 1",
      [requesterId, identifier.trim()],
    );
    return result.rows[0] ? toFriendRequest(result.rows[0]) : undefined;
  }
  async saveFriendRequest(row: FriendRequest): Promise<void> {
    await this.pool.query(
      'UPDATE friend_requests SET target_user_id=$2,target_identifier=$3,target_email=$4,status=$5,accepted_at=$6 WHERE id=$1',
      [
        row.id,
        row.targetUserId ?? null,
        row.targetIdentifier,
        row.targetEmail ?? null,
        row.status,
        row.acceptedAt ?? null,
      ],
    );
  }
  async acceptFriendRequest(
    requestId: string,
    actorId: string,
    acceptedAt: string,
  ): Promise<Friendship> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const requestResult = await client.query<FriendRequestRow>(
        'SELECT * FROM friend_requests WHERE id=$1 FOR UPDATE',
        [requestId],
      );
      const request = requestResult.rows[0];
      if (!request) throw new Error('Friend request was not found.');
      if (request.target_user_id && request.target_user_id !== actorId)
        throw new Error('Friend request is addressed to another identity.');
      if (request.status === 'rejected') throw new Error('Friend request is no longer pending.');
      if (request.status === 'accepted') {
        const acceptedFriendship = await client.query<{
          user_a: string;
          user_b: string;
          created_at: Date;
        }>('SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2 FOR UPDATE', [
          ...[request.requester_id, actorId].sort(),
        ]);
        if (!acceptedFriendship.rows[0])
          throw new Error('Accepted friend request has no friendship.');
        await client.query(
          'UPDATE friend_requests SET target_user_id=$2,accepted_at=COALESCE(accepted_at,$3) WHERE id=$1',
          [requestId, actorId, acceptedAt],
        );
        await client.query('COMMIT');
        const row = acceptedFriendship.rows[0];
        return {
          userA: row.user_a,
          userB: row.user_b,
          createdAt: row.created_at.toISOString(),
        };
      }
      const [a, b] = [request.requester_id, actorId].sort();
      const existing = await client.query<{ user_a: string; user_b: string; created_at: Date }>(
        'SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2 FOR UPDATE',
        [a, b],
      );
      if (request.status !== 'pending') throw new Error('Friend request is no longer pending.');
      await client.query(
        'INSERT INTO friendships(user_a,user_b,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [a, b, acceptedAt],
      );
      const canonical =
        existing.rows[0] ??
        (
          await client.query<{ user_a: string; user_b: string; created_at: Date }>(
            'SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2 FOR UPDATE',
            [a, b],
          )
        ).rows[0];
      if (!canonical) throw new Error('Friendship could not be created.');
      await client.query(
        "UPDATE friend_requests SET target_user_id=$2,status='accepted',accepted_at=$3 WHERE id=$1",
        [requestId, actorId, acceptedAt],
      );
      await client.query('COMMIT');
      return {
        userA: canonical.user_a,
        userB: canonical.user_b,
        createdAt: canonical.created_at.toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async listFriendRequests(userId: string): Promise<FriendRequest[]> {
    const result = await this.pool.query<FriendRequestRow>(
      'SELECT * FROM friend_requests WHERE requester_id=$1 OR target_user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(toFriendRequest);
  }
  async findFriendship(userA: string, userB: string): Promise<Friendship | undefined> {
    const [a, b] = [userA, userB].sort();
    const result = await this.pool.query<{ user_a: string; user_b: string; created_at: Date }>(
      'SELECT * FROM friendships WHERE user_a=$1 AND user_b=$2',
      [a, b],
    );
    return result.rows[0]
      ? {
          userA: result.rows[0].user_a,
          userB: result.rows[0].user_b,
          createdAt: result.rows[0].created_at.toISOString(),
        }
      : undefined;
  }
  async listFriendships(userId: string): Promise<Friendship[]> {
    const result = await this.pool.query<{ user_a: string; user_b: string; created_at: Date }>(
      'SELECT * FROM friendships WHERE user_a=$1 OR user_b=$1 ORDER BY created_at',
      [userId],
    );
    return result.rows.map((row) => ({
      userA: row.user_a,
      userB: row.user_b,
      createdAt: row.created_at.toISOString(),
    }));
  }
  async saveFriendship(row: Friendship): Promise<void> {
    const [a, b] = [row.userA, row.userB].sort();
    await this.pool.query(
      'INSERT INTO friendships (user_a,user_b,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [a, b, row.createdAt],
    );
  }
  async removeFriendship(userA: string, userB: string): Promise<void> {
    const [a, b] = [userA, userB].sort();
    await this.pool.query('DELETE FROM friendships WHERE user_a=$1 AND user_b=$2', [a, b]);
  }
  async createGroup(row: Group): Promise<void> {
    await this.pool.query(
      'INSERT INTO social_groups (id,name,image_url,type,created_by,dissolved_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        row.id,
        row.name,
        row.imageUrl,
        row.type,
        row.createdBy,
        row.dissolvedAt,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }
  async createGroupWithAdmin(group: Group, member: GroupMember): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO social_groups (id,name,image_url,type,created_by,dissolved_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          group.id,
          group.name,
          group.imageUrl,
          group.type,
          group.createdBy,
          group.dissolvedAt,
          group.createdAt,
          group.updatedAt,
        ],
      );
      await client.query(
        'INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES ($1,$2,$3,$4)',
        [member.groupId, member.userId, member.role, member.joinedAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async findGroup(id: string): Promise<Group | undefined> {
    const r = await this.pool.query<GroupRow>('SELECT * FROM social_groups WHERE id=$1', [id]);
    return r.rows[0] ? toGroup(r.rows[0]) : undefined;
  }
  async saveGroup(row: Group): Promise<void> {
    await this.pool.query(
      'UPDATE social_groups SET name=$2,image_url=$3,type=$4,dissolved_at=$5,updated_at=$6 WHERE id=$1',
      [row.id, row.name, row.imageUrl, row.type, row.dissolvedAt, row.updatedAt],
    );
  }
  async addMember(row: GroupMember): Promise<void> {
    await this.pool.query(
      'INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES ($1,$2,$3,$4) ON CONFLICT (group_id,user_id) DO NOTHING',
      [row.groupId, row.userId, row.role, row.joinedAt],
    );
  }
  async findMember(groupId: string, userId: string): Promise<GroupMember | undefined> {
    const r = await this.pool.query<MemberRow>(
      'SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2',
      [groupId, userId],
    );
    return r.rows[0] ? toMember(r.rows[0]) : undefined;
  }
  async listMembers(groupId: string): Promise<GroupMember[]> {
    const r = await this.pool.query<MemberRow>(
      'SELECT * FROM group_members WHERE group_id=$1 ORDER BY joined_at',
      [groupId],
    );
    return r.rows.map(toMember);
  }
  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [
      groupId,
      userId,
    ]);
  }
  async createInvitation(row: GroupInvitation): Promise<void> {
    await this.pool.query(
      'INSERT INTO group_invitations (id,group_id,inviter_id,kind,target_identifier,target_email,target_user_id,token,status,created_at,accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        row.id,
        row.groupId,
        row.inviterId,
        row.kind,
        row.targetIdentifier ?? null,
        row.targetEmail ?? null,
        row.targetUserId ?? null,
        row.token ?? null,
        row.status,
        row.createdAt,
        row.acceptedAt ?? null,
      ],
    );
  }
  async findPendingInvitation(
    groupId: string,
    kind: GroupInvitation['kind'],
    identifier?: string,
  ): Promise<GroupInvitation | undefined> {
    const result = await this.pool.query<InvitationRow>(
      kind === 'email'
        ? "SELECT * FROM group_invitations WHERE group_id=$1 AND kind=$2 AND status='pending' AND lower(target_identifier)=lower($3) LIMIT 1"
        : "SELECT * FROM group_invitations WHERE group_id=$1 AND kind=$2 AND status='pending' LIMIT 1",
      kind === 'email' ? [groupId, kind, identifier ?? ''] : [groupId, kind],
    );
    return result.rows[0] ? toInvitation(result.rows[0]) : undefined;
  }
  async findInvitation(id: string): Promise<GroupInvitation | undefined> {
    const r = await this.pool.query<InvitationRow>('SELECT * FROM group_invitations WHERE id=$1', [
      id,
    ]);
    return r.rows[0] ? toInvitation(r.rows[0]) : undefined;
  }
  async findInvitationByToken(token: string): Promise<GroupInvitation | undefined> {
    const r = await this.pool.query<InvitationRow>(
      'SELECT * FROM group_invitations WHERE token=$1',
      [token],
    );
    return r.rows[0] ? toInvitation(r.rows[0]) : undefined;
  }
  async saveInvitation(row: GroupInvitation): Promise<void> {
    await this.pool.query(
      'UPDATE group_invitations SET status=$2,accepted_at=$3,target_user_id=$4 WHERE id=$1',
      [row.id, row.status, row.acceptedAt ?? null, row.targetUserId ?? null],
    );
  }
  async acceptGroupInvitation(
    invitationId: string,
    actorId: string,
    joinedAt: string,
    acceptedAt: string,
  ): Promise<GroupMember> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const invitationResult = await client.query<InvitationRow>(
        'SELECT * FROM group_invitations WHERE id=$1 FOR UPDATE',
        [invitationId],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new Error('Invitation was not found.');
      const group = await client.query<{ dissolved_at: Date | null }>(
        'SELECT dissolved_at FROM social_groups WHERE id=$1 FOR UPDATE',
        [invitation.group_id],
      );
      if (!group.rows[0] || group.rows[0].dissolved_at) throw new Error('Group is unavailable.');
      if (invitation.target_user_id && invitation.target_user_id !== actorId)
        throw new Error('Invitation is addressed to another identity.');
      if (invitation.status === 'revoked') throw new Error('Invitation is no longer pending.');
      const memberResult = await client.query<MemberRow>(
        'SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2 FOR UPDATE',
        [invitation.group_id, actorId],
      );
      if (invitation.status === 'accepted' && memberResult.rows[0]) {
        await client.query(
          "UPDATE group_invitations SET status='accepted',accepted_at=COALESCE(accepted_at,$2),target_user_id=$3 WHERE id=$1",
          [invitationId, acceptedAt, actorId],
        );
        await client.query('COMMIT');
        return toMember(memberResult.rows[0]);
      }
      if (invitation.status !== 'pending') throw new Error('Invitation is no longer pending.');
      await client.query(
        'INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [invitation.group_id, actorId, 'member', joinedAt],
      );
      const canonicalMember =
        memberResult.rows[0] ??
        (
          await client.query<MemberRow>(
            'SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2 FOR UPDATE',
            [invitation.group_id, actorId],
          )
        ).rows[0];
      if (!canonicalMember) throw new Error('Group member could not be created.');
      await client.query(
        "UPDATE group_invitations SET status='accepted',accepted_at=$2,target_user_id=$3 WHERE id=$1",
        [invitationId, acceptedAt, actorId],
      );
      await client.query('COMMIT');
      return toMember(canonicalMember);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function toFriendRequest(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    targetUserId: row.target_user_id ?? undefined,
    targetIdentifier: row.target_identifier,
    targetEmail: row.target_email ?? undefined,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString(),
  };
}
function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    type: row.type,
    createdBy: row.created_by,
    dissolvedAt: row.dissolved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function toMember(row: MemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at.toISOString(),
  };
}
function toInvitation(row: InvitationRow): GroupInvitation {
  return {
    id: row.id,
    groupId: row.group_id,
    inviterId: row.inviter_id,
    kind: row.kind,
    targetIdentifier: row.target_identifier ?? undefined,
    targetEmail: row.target_email ?? undefined,
    targetUserId: row.target_user_id ?? undefined,
    token: row.token ?? undefined,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString(),
  };
}
