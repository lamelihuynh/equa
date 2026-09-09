export interface LedgerSocialAdapter {
  isGroupMember(groupId: string, userId: string): Promise<boolean>;
  isGroupAdmin(groupId: string, userId: string): Promise<boolean>;
  isFriend(userA: string, userB: string): Promise<boolean>;
}

export class FailClosedSocialAdapter implements LedgerSocialAdapter {
  private unavailable(): Error {
    return new Error('Social membership service is unavailable.');
  }
  isGroupMember(): Promise<boolean> {
    return Promise.reject(this.unavailable());
  }
  isGroupAdmin(): Promise<boolean> {
    return Promise.reject(this.unavailable());
  }
  isFriend(): Promise<boolean> {
    return Promise.reject(this.unavailable());
  }
}

export class HttpLedgerSocialAdapter implements LedgerSocialAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async isGroupMember(groupId: string, userId: string): Promise<boolean> {
    return (await this.request<{ member: boolean }>('/internal/groups/member', { groupId, userId }))
      .member;
  }
  async isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    return (await this.request<{ admin: boolean }>('/internal/groups/admin', { groupId, userId }))
      .admin;
  }
  async isFriend(userA: string, userB: string): Promise<boolean> {
    return (await this.request<{ friend: boolean }>('/internal/friends/check', { userA, userB }))
      .friend;
  }
  private async request<T>(path: string, body: object): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-equa-service-key': this.serviceKey },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Social request failed.', {
        cause: error,
      });
    }
    if (!response.ok) throw new Error(`Social rejected request (${response.status}).`);
    return (await response.json()) as T;
  }
}
