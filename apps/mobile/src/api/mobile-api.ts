import type { SupportedCurrency } from '@equa/contracts';

export type GroupType = 'trip' | 'household' | 'event' | 'other';

export interface IdentityLabelDto {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

export interface FriendRequestDto {
  id: string;
  requesterId: string;
  targetUserId?: string;
  targetIdentifier: string;
  targetEmail?: string;
  requester: IdentityLabelDto;
  target?: IdentityLabelDto;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface FriendshipDto {
  userA: string;
  userB: string;
  createdAt: string;
  friend: IdentityLabelDto;
}

export interface GroupDto {
  id: string;
  name: string;
  imageUrl: string | null;
  type: GroupType;
  createdBy: string;
  dissolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMemberDto {
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
  user?: IdentityLabelDto;
}

export interface GroupInvitationDto {
  id: string;
  groupId: string;
  inviterId: string;
  kind: 'email' | 'link';
  targetIdentifier?: string;
  targetEmail?: string;
  targetUserId?: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  group: Pick<GroupDto, 'id' | 'name' | 'type'>;
  inviter: IdentityLabelDto;
}

export interface CreatedGroupInvitationDto {
  id: string;
  groupId: string;
  targetEmail: string;
  status: 'pending';
  createdAt: string;
}

export interface FriendBalanceDto {
  userId: string;
  counterpartyId: string;
  balances?: Array<{ currency: string; netMinor: string }>;
  netMinor: string | null;
  currency: string | null;
  hasOutstandingDebt: boolean;
}

export interface ExpenseParticipantDto {
  userId: string;
  shareMinor: string;
}

export interface ExpenseDto {
  id: string;
  ownerId: string;
  payerId: string;
  amountMinor: string;
  currency: SupportedCurrency;
  description: string;
  categoryId: string | null;
  friendId: string | null;
  groupId: string | null;
  tripId: string | null;
  participants: ExpenseParticipantDto[];
  state: 'ACTIVE' | 'UPDATED' | 'DELETED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDto {
  id: string;
  ownerId: string;
  name: string;
  standard: boolean;
  createdAt: string;
}

export interface ExpenseTotalDto {
  totalMinor: string | null;
  currency: string | null;
  count: number;
  totals: Array<{ currency: string; totalMinor: string; count: number }>;
}

export interface CreateExpenseDto {
  amountMinor: string;
  currency: SupportedCurrency;
  description: string;
  payerId: string;
  participants: ExpenseParticipantDto[];
  categoryId?: string;
  friendId?: string;
  groupId?: string;
}

export interface UpdateExpenseDto extends Partial<CreateExpenseDto> {
  expectedVersion: number;
}

type TokenProvider = (refresh?: boolean) => Promise<string | null>;
type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
};

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

export class MobileApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: TokenProvider,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let accessToken = await this.token();
    if (!accessToken) throw new MobileApiError('Cần đăng nhập để tiếp tục.', 401);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Equa-Client': 'mobile',
      };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}/${path.replace(/^\/+/, '')}`, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        throw new MobileApiError(
          error instanceof Error ? error.message : 'Không kết nối được Equa.',
          0,
          'NETWORK_ERROR',
        );
      }

      if (response.status === 401 && attempt === 0) {
        accessToken = await this.token(true);
        if (accessToken) continue;
      }
      if (response.status === 204) return undefined as T;

      const value: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = isRecord(value) ? value : {};
        throw new MobileApiError(
          typeof error.message === 'string' ? error.message : 'Yêu cầu không thành công.',
          response.status,
          typeof error.code === 'string' ? error.code : undefined,
        );
      }
      return value as T;
    }
    throw new MobileApiError('Phiên đăng nhập cần được xác thực lại.', 401);
  }

  getFriends(): Promise<FriendshipDto[]> {
    return this.request('friends');
  }

  getFriendRequests(): Promise<FriendRequestDto[]> {
    return this.request('friends/requests');
  }

  sendFriendRequest(identifier: string): Promise<FriendRequestDto> {
    return this.request('friends/requests', {
      method: 'POST',
      body: { identifier },
    });
  }

  acceptFriendRequest(id: string): Promise<FriendshipDto> {
    return this.request(`friends/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' });
  }

  rejectFriendRequest(id: string): Promise<void> {
    return this.request(`friends/requests/${encodeURIComponent(id)}/reject`, { method: 'POST' });
  }

  removeFriend(friendId: string): Promise<void> {
    return this.request(`friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' });
  }

  getFriendBalance(friendId: string): Promise<FriendBalanceDto> {
    return this.request(`friends/${encodeURIComponent(friendId)}/balance`);
  }

  getGroups(): Promise<GroupDto[]> {
    return this.request('groups');
  }

  getGroup(id: string): Promise<GroupDto> {
    return this.request(`groups/${encodeURIComponent(id)}`);
  }

  getGroupMembers(id: string): Promise<GroupMemberDto[]> {
    return this.request(`groups/${encodeURIComponent(id)}/members`);
  }

  getGroupInvitations(): Promise<GroupInvitationDto[]> {
    return this.request('groups/invitations');
  }

  createGroup(input: { name: string; type: GroupType }): Promise<GroupDto> {
    return this.request('groups', { method: 'POST', body: input });
  }

  updateGroup(
    id: string,
    input: Partial<Pick<GroupDto, 'name' | 'type' | 'imageUrl'>>,
  ): Promise<GroupDto> {
    return this.request(`groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  }

  dissolveGroup(id: string): Promise<void> {
    return this.request(`groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async inviteToGroup(id: string, email: string): Promise<CreatedGroupInvitationDto> {
    const value: unknown = await this.request(`groups/${encodeURIComponent(id)}/invitations`, {
      method: 'POST',
      body: { kind: 'email', identifier: email },
    });
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      value.status !== 'pending' ||
      typeof value.createdAt !== 'string'
    )
      throw new MobileApiError('Equa trả về lời mời không hợp lệ.', 502, 'INVALID_INVITATION');
    return {
      id: value.id,
      groupId: id,
      targetEmail: email,
      status: 'pending',
      createdAt: value.createdAt,
    };
  }

  acceptGroupInvitation(id: string): Promise<unknown> {
    return this.request(`groups/invitations/${encodeURIComponent(id)}/accept`, { method: 'POST' });
  }

  declineGroupInvitation(id: string): Promise<unknown> {
    return this.request(`groups/invitations/${encodeURIComponent(id)}/decline`, { method: 'POST' });
  }

  removeGroupMember(groupId: string, userId: string): Promise<void> {
    return this.request(
      `groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  }

  getExpenses(): Promise<ExpenseDto[]> {
    return this.request('expenses');
  }

  getExpenseTotals(): Promise<ExpenseTotalDto> {
    return this.request('expenses/total');
  }

  getCategories(): Promise<CategoryDto[]> {
    return this.request('categories');
  }

  createExpense(input: CreateExpenseDto, idempotencyKey: string): Promise<ExpenseDto> {
    return this.request('expenses', { method: 'POST', body: input, idempotencyKey });
  }

  updateExpense(id: string, input: UpdateExpenseDto, idempotencyKey: string): Promise<ExpenseDto> {
    return this.request(`expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      idempotencyKey,
    });
  }

  deleteExpense(id: string, expectedVersion: number, idempotencyKey: string): Promise<ExpenseDto> {
    return this.request(`expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: { expectedVersion },
      idempotencyKey,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
