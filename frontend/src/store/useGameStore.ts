import { create } from 'zustand';
import API from '../services/api';

export interface OwnedNode {
  id: number;
  level: number;
  current_cost: number;
  yield_per_sec: number;
  node: { id: number; name: string; icon: string; base_yield: number };
}

interface ServerState {
  currency: number;
  prestige_multiplier: number;
  production_per_sec: number;
  offline_earned: number;
  nodes: OwnedNode[];
}

interface GameStore {
  currency: number;
  productionPerSec: number;
  prestigeMultiplier: number;
  ownedNodes: OwnedNode[];
  offlineEarned: number;
  pendingClicks: number;
  setCurrency: (v: number | ((prev: number) => number)) => void;
  fetchGameState: () => Promise<void>;
  buyNode: (nodeId: number) => Promise<void>;
  gather: () => void;
  dismissOfflineEarned: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  // Replace local state with what the server says (server is authoritative).
  const apply = (s: ServerState, keepOffline = false) =>
    set((prev) => ({
      // Clicks still waiting to be sent are added back so the number doesn't jump backwards.
      currency: s.currency + prev.pendingClicks * s.prestige_multiplier,
      productionPerSec: s.production_per_sec,
      prestigeMultiplier: s.prestige_multiplier,
      ownedNodes: s.nodes,
      offlineEarned: keepOffline ? prev.offlineEarned : s.offline_earned,
    }));

  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushClicks = async () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const clicks = get().pendingClicks;
    if (clicks === 0) return;
    set({ pendingClicks: 0 });
    try {
      const res = await API.post<ServerState>('gather/', { clicks });
      apply(res.data, true);
    } catch (e) {
      console.error('gather failed', e);
      // Put the clicks back so they're retried on the next flush.
      set((prev) => ({ pendingClicks: prev.pendingClicks + clicks }));
    }
  };

  return {
    currency: 0,
    productionPerSec: 0,
    prestigeMultiplier: 1,
    ownedNodes: [],
    offlineEarned: 0,
    pendingClicks: 0,

    setCurrency: (v) =>
      set((s) => ({ currency: typeof v === 'function' ? v(s.currency) : v })),

    fetchGameState: async () => {
      await flushClicks();
      try {
        const res = await API.get<ServerState>('state/');
        apply(res.data);
      } catch (e) {
        console.error('state failed', e);
      }
    },

    buyNode: async (nodeId) => {
      await flushClicks();
      try {
        const res = await API.post<ServerState>('buy/', { node_id: nodeId });
        apply(res.data, true);
      } catch (err: any) {
        console.error('buy failed', err.response?.status, err.response?.data);
        // Server rejected (e.g. not enough gold) but sends back the true state: resync to it.
        if (err.response?.data?.nodes) apply(err.response.data, true);
      }
    },

    gather: () => {
      set((s) => ({
        currency: s.currency + s.prestigeMultiplier,
        pendingClicks: s.pendingClicks + 1,
      }));
      if (!flushTimer) flushTimer = setTimeout(flushClicks, 1500);
    },

    dismissOfflineEarned: () => set({ offlineEarned: 0 }),
  };
});