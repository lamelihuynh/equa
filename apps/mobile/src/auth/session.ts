import * as SecureStore from 'expo-secure-store';

export { accountHint } from './token';

const accessKey = 'equa_access_token';
const refreshKey = 'equa_refresh_token';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
export interface SessionApi {
  refresh(refreshToken: string): Promise<TokenPair>;
}

export class SessionManager {
  private refreshPromise: { epoch: number; value: Promise<TokenPair> } | undefined;
  private generation = 0;
  private refreshBlocked = false;
  private persistence: Promise<void> = Promise.resolve();
  constructor(private readonly api: SessionApi) {}

  /**
   * Invalidates the active session before an authentication request begins.
   * The returned epoch must accompany its eventual result, so a late response
   * cannot replace a logout or a newer account's session.
   */
  begin(): number {
    const epoch = ++this.generation;
    this.refreshBlocked = false;
    void this.deleteStoredTokens().catch(() => undefined);
    return epoch;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.generation;
  }

  async save(tokens: TokenPair, epoch = this.generation): Promise<boolean> {
    if (!this.isCurrent(epoch)) return false;
    let saved = false;
    await this.enqueue(async () => {
      if (!this.isCurrent(epoch)) return;
      await SecureStore.setItemAsync(accessKey, tokens.accessToken);
      if (!this.isCurrent(epoch)) return;
      await SecureStore.setItemAsync(refreshKey, tokens.refreshToken);
      saved = this.isCurrent(epoch);
      if (saved) this.refreshBlocked = false;
    });
    return saved;
  }
  async accessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(accessKey);
  }
  async token(refresh = false): Promise<string | null> {
    if (!refresh) return this.accessToken();
    return (await this.refresh()).accessToken;
  }
  async refresh(): Promise<TokenPair> {
    if (this.refreshBlocked) throw new Error('Session refresh was invalidated; sign in again.');
    const epoch = this.generation;
    if (!this.refreshPromise || this.refreshPromise.epoch !== epoch)
      this.refreshPromise = { epoch, value: this.rotate(epoch) };
    const active = this.refreshPromise;
    try {
      return await active.value;
    } finally {
      if (this.refreshPromise === active) this.refreshPromise = undefined;
    }
  }
  async clear(): Promise<void> {
    this.generation += 1;
    this.refreshBlocked = true;
    await this.deleteStoredTokens();
  }
  private async deleteStoredTokens(): Promise<void> {
    await this.enqueue(async () => {
      await SecureStore.deleteItemAsync(accessKey);
      await SecureStore.deleteItemAsync(refreshKey);
    });
  }
  private async rotate(generation: number): Promise<TokenPair> {
    try {
      const refreshToken = await SecureStore.getItemAsync(refreshKey);
      if (!refreshToken) throw new Error('No refresh token.');
      const tokens = await this.api.refresh(refreshToken);
      if (generation !== this.generation) throw new Error('Session changed while refreshing.');
      if (!(await this.save(tokens, generation)))
        throw new Error('Session changed while refreshing.');
      return tokens;
    } catch (error) {
      if (generation === this.generation) {
        this.refreshBlocked = true;
        try {
          await this.deleteStoredTokens();
        } catch {
          // Block another rotation in this session even if secure deletion fails.
        }
      }
      throw error;
    }
  }

  private async enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.persistence.then(task, task);
    this.persistence = next.catch(() => undefined);
    await next;
  }
}
