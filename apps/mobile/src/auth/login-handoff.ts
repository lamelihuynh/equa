import { accountHint } from './token';

export interface SessionEpochGuard {
  isCurrent(epoch: number): boolean;
}

export interface LoginHandoffInput<TStore, TClient> {
  session: SessionEpochGuard;
  epoch: number;
  accessToken: string;
  openStore(): Promise<TStore>;
  createClient(store: TStore): TClient;
  stopSync(): void;
  setSync(client: TClient): void;
  startSync(client: TClient, ownerId: string): void;
  setOwner(ownerId: string | null): void;
  setAuthenticated(authenticated: boolean): void;
}

/** Completes login only while the captured session epoch still owns the UI session. */
export async function finishLoginHandoff<TStore, TClient>(
  input: LoginHandoffInput<TStore, TClient>,
): Promise<boolean> {
  if (!input.session.isCurrent(input.epoch)) return false;
  const ownerId = accountHint(input.accessToken) ?? null;
  if (ownerId) {
    const store = await input.openStore();
    if (!input.session.isCurrent(input.epoch)) return false;
    input.stopSync();
    const client = input.createClient(store);
    input.setSync(client);
    input.startSync(client, ownerId);
  }
  if (!input.session.isCurrent(input.epoch)) return false;
  input.setOwner(ownerId);
  input.setAuthenticated(true);
  return true;
}
