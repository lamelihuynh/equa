import * as Network from 'expo-network';

import type { Connectivity } from './sync-client';

function online(state: Network.NetworkState): boolean {
  return state.isInternetReachable ?? state.isConnected ?? false;
}

/** Bridges the native Expo network listener into the sync client's small runtime contract. */
export function createExpoConnectivity(): Connectivity {
  return {
    subscribe(listener) {
      let stopped = false;
      const emit = (state: Network.NetworkState): void => {
        if (!stopped) listener(online(state));
      };
      const subscription = Network.addNetworkStateListener(emit);
      void Network.getNetworkStateAsync()
        .then(emit)
        .catch(() => undefined);
      return () => {
        stopped = true;
        subscription.remove();
      };
    },
  };
}
