export type GroupType = 'trip' | 'household' | 'event' | 'other';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type GroupInvitationKind = 'email' | 'link';

export interface SocialUser {
  id: string;
  email?: string;
  username?: string;
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
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  acceptedAt?: string;
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
