import { describe, expect, it } from 'vitest';

import { finishLoginHandoff } from './login-handoff';

const accessToken = (ownerId: string): string =>
  `header.${btoa(JSON.stringify({ sub: ownerId })).replace(/=/g, '')}.signature`;

interface Effects {
  owner: string | null | undefined;
  authenticated: boolean | undefined;
  syncClients: string[];
  starts: string[];
  stops: number;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise: ((value: T) => void) | undefined;
  return {
    promise: new Promise<T>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

function runDelayedHandoff(currentEpoch: { value: number }): {
  opened: ReturnType<typeof deferred<string>>;
  effects: Effects;
  task: Promise<boolean>;
} {
  const opened = deferred<string>();
  const effects: Effects = {
    owner: undefined,
    authenticated: undefined,
    syncClients: [],
    starts: [],
    stops: 0,
  };
  const task = finishLoginHandoff({
    session: { isCurrent: (epoch) => epoch === currentEpoch.value },
    epoch: 1,
    accessToken: accessToken('account-one'),
    openStore: () => opened.promise,
    createClient: (store) => `sync:${store}`,
    stopSync: () => {
      effects.stops += 1;
    },
    setSync: (client) => {
      effects.syncClients.push(client);
    },
    startSync: (_client, ownerId) => {
      effects.starts.push(ownerId);
    },
    setOwner: (ownerId) => {
      effects.owner = ownerId;
    },
    setAuthenticated: (authenticated) => {
      effects.authenticated = authenticated;
    },
  });
  return { opened, effects, task };
}

describe('finishLoginHandoff', () => {
  it('does not restore session UI or start sync when logout occurs while opening SQLite', async () => {
    const currentEpoch = { value: 1 };
    const { opened, effects, task } = runDelayedHandoff(currentEpoch);
    currentEpoch.value = 2;
    opened.resolve('store');
    await expect(task).resolves.toBe(false);
    expect(effects).toEqual({
      owner: undefined,
      authenticated: undefined,
      syncClients: [],
      starts: [],
      stops: 0,
    });
  });

  it('does not let an older account handoff overwrite a newer login while opening SQLite', async () => {
    const currentEpoch = { value: 1 };
    const { opened, effects, task } = runDelayedHandoff(currentEpoch);
    currentEpoch.value = 2;
    opened.resolve('store');
    await expect(task).resolves.toBe(false);
    expect(effects.syncClients).toEqual([]);
    expect(effects.starts).toEqual([]);
    expect(effects.owner).toBeUndefined();
    expect(effects.authenticated).toBeUndefined();
  });
});
