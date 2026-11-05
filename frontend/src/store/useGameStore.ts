import { create } from 'zustand';
import API from '../services/api';

export interface OwnedNode {
  id: number;
  level: number;
  stock: number;
  current_cost: number;
  yield_per_sec: number;
  resource_label: string;
  sell_price: number;
  node: { id: number; name: string; icon: string; base_yield: number };
}

export interface OfflineEntry {
  resource: string;
  amount: number;
}

interface ServerState {
  currency: number;
  prestige_multiplier: number;
  offline_earned: OfflineEntry[];
  nodes: OwnedNode[];
}

interface GameStore {
  currency: number;
  prestigeMultiplier: number;
  ownedNodes: OwnedNode[];
  offlineEarned: OfflineEntry[];
  pendingClicks: number;
  fetchGameState: () => Promise<void>;
  buyNode: (nodeId: number) => Promise<void>;
  sellNode: (nodeId: number) => Promise<void>;
  sellAll: () => Promise<void>;
  gather: () => void;
  tickStocks: (seconds: number) => void;
  dismissOfflineEarned: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  // Replace local state with what the server says (server is authoritative).
  const apply = (s: ServerState) =>
    set((prev) => ({
      // Clicks still waiting to be sent are added back so the number doesn't jump backwards.
      currency: s.currency + prev.pendingClicks * s.prestige_multiplier,
      prestigeMultiplier: s.prestige_multiplier,
      ownedNodes: s.nodes,
      // Keep the "welcome back" banner until dismissed; only replace it with a new report.
      offlineEarned: s.offline_earned.length ? s.offline_earned : prev.offlineEarned,
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
      apply(res.data);
    } catch (e) {
      console.error('gather failed', e);
      set((prev) => ({ pendingClicks: prev.pendingClicks + clicks }));
    }
  };

  return {
    currency: 0,
    prestigeMultiplier: 1,
    ownedNodes: [],
    offlineEarned: [],
    pendingClicks: 0,

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
        apply(res.data);
      } catch (err: any) {
        console.error('buy failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    sellNode: async (nodeId) => {
      try {
        const res = await API.post<ServerState>('sell/', { node_id: nodeId });
        apply(res.data);
      } catch (e: any) {
        console.error('sell failed', e.response?.status, e.response?.data);
      }
    },

    sellAll: async () => {
      try {
        const res = await API.post<ServerState>('sell/', { all: true });
        apply(res.data);
      } catch (e: any) {
        console.error('sell all failed', e.response?.status, e.response?.data);
      }
    },

    gather: () => {
      set((s) => ({
        currency: s.currency + s.prestigeMultiplier,
        pendingClicks: s.pendingClicks + 1,
      }));
      if (!flushTimer) flushTimer = setTimeout(flushClicks, 1500);
    },

    // Smoothly grow stockpiles on the client between server syncs.
    tickStocks: (seconds) =>
      set((s) => ({
        ownedNodes: s.ownedNodes.map((n) =>
          n.yield_per_sec > 0 ? { ...n, stock: n.stock + n.yield_per_sec * seconds } : n
        ),
      })),

    dismissOfflineEarned: () => set({ offlineEarned: [] }),
  };
});