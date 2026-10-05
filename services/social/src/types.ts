export type GroupType = 'trip' | 'household' | 'event' | 'other';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type GroupInvitationKind = 'email' | 'link';

export interface HumanIdentity {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

export interface SocialUser extends HumanIdentity {
  id: string;
}

export interface FriendshipView extends Friendship {
  friend: SocialUser;
}

export interface FriendRequestView extends FriendRequest {
  requester: SocialUser;
  target?: HumanIdentity;
}

export interface GroupMemberView extends GroupMember {
  user: SocialUser;
}

export interface FriendRequest {
  id: string;
  requesterId: string;
  targetUserId?: string;
  targetIdentifier: string;
  targetEmail?: string;
  status: FriendRequestStatus;
  createdAt: string;
  acceptedAt?: string;
}

export interface Friendship {
  userA: string;
  userB: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  imageUrl: string | null;
  type: GroupType;
  createdBy: string;
  dissolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  inviterId: string;
  kind: GroupInvitationKind;
  targetIdentifier?: string;
  targetEmail?: string;
  targetUserId?: string;
  token?: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  acceptedAt?: string;
}

export interface PendingGroupInvitation {
  invitation: GroupInvitation;
  group: Pick<Group, 'id' | 'name' | 'type'>;
}

export interface GroupInvitationView extends GroupInvitation {
  group: Pick<Group, 'id' | 'name' | 'type'>;
  inviter: SocialUser;
}

export interface PairBalance {
  userId: string;
  counterpartyId: string;
  /** Currency-separated balances; omitted by legacy adapters. */
  balances?: Array<{ currency: string; netMinor: string }>;
  netMinor: string | null;
  currency: string | null;
  hasOutstandingDebt: boolean;
}
