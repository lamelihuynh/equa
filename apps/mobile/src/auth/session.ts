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
  private persistence: Promise<void> = Promise.resolve();
  constructor(private readonly api: SessionApi) {}

  /**
   * Invalidates the active session before an authentication request begins.
   * The returned epoch must accompany its eventual result, so a late response
   * cannot replace a logout or a newer account's session.
   */
  begin(): number {
    const epoch = ++this.generation;
    void this.enqueue(async () => {
      await SecureStore.deleteItemAsync(accessKey);
      await SecureStore.deleteItemAsync(refreshKey);
    });
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
    await this.enqueue(async () => {
      await SecureStore.deleteItemAsync(accessKey);
      await SecureStore.deleteItemAsync(refreshKey);
    });
  }
  private async rotate(generation: number): Promise<TokenPair> {
    const refreshToken = await SecureStore.getItemAsync(refreshKey);
    if (!refreshToken) throw new Error('No refresh token.');
    const tokens = await this.api.refresh(refreshToken);
    if (generation !== this.generation) throw new Error('Session changed while refreshing.');
    if (!(await this.save(tokens, generation)))
      throw new Error('Session changed while refreshing.');
    return tokens;
  }

  private async enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.persistence.then(task, task);
    this.persistence = next.catch(() => undefined);
    await next;
  }
}
