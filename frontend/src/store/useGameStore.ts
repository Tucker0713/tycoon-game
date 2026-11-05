import { create } from 'zustand';
import API from '../services/api';

export interface OwnedNode {
  id: number;
  level: number;
  max_level: number;
  stock: number;        // collected, sellable
  pending: number;      // produced but not yet collected
  item_value: number;   // units one pickup is worth
  spawn_interval: number; // seconds between pickups for this producer
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
  pendingCollects: Record<number, number>;
  fetchGameState: () => Promise<boolean>;
  buyNode: (nodeId: number) => Promise<void>;
  sellNode: (nodeId: number) => Promise<void>;
  sellAll: () => Promise<void>;
  gather: () => void;
  collect: (nodeId: number) => void;
  dismissOfflineEarned: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  // Replace local state with what the server says (server is authoritative).
  const apply = (s: ServerState) =>
    set((prev) => ({
      // Unsent coin clicks are added back so the number doesn't jump backwards.
      currency: s.currency + prev.pendingClicks * s.prestige_multiplier,
      prestigeMultiplier: s.prestige_multiplier,
      // Same for collected pickups the server hasn't heard about yet.
      ownedNodes: s.nodes.map((n) => ({
        ...n,
        stock: n.stock + (prev.pendingCollects[n.id] ?? 0) * n.item_value,
      })),
      // Keep the "welcome back" banner until dismissed; only replace it with a new report.
      offlineEarned: s.offline_earned.length ? s.offline_earned : prev.offlineEarned,
    }));

  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let collectTimer: ReturnType<typeof setTimeout> | null = null;

  const flushClicks = async () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
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

  const flushCollects = async () => {
    if (collectTimer) {
      clearTimeout(collectTimer);
      collectTimer = null;
    }
    const items = Object.entries(get().pendingCollects)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ node_id: Number(id), count }));
    if (items.length === 0) return;
    set({ pendingCollects: {} });
    try {
      const res = await API.post<ServerState>('collect/', { items });
      apply(res.data);
    } catch (e) {
      console.error('collect failed', e);
      // Put the counts back so they're retried on the next flush.
      set((prev) => {
        const merged = { ...prev.pendingCollects };
        for (const it of items) merged[it.node_id] = (merged[it.node_id] ?? 0) + it.count;
        return { pendingCollects: merged };
      });
    }
  };

  // Send anything the server hasn't heard about before an action that depends on it.
  const flushAll = async () => {
    await flushClicks();
    await flushCollects();
  };

  return {
    currency: 0,
    prestigeMultiplier: 1,
    ownedNodes: [],
    offlineEarned: [],
    pendingClicks: 0,
    pendingCollects: {},

    fetchGameState: async () => {
      await flushAll();
      try {
        const res = await API.get<ServerState>('state/');
        apply(res.data);
        return true;
      } catch (e) {
        console.error('state failed', e);
        return false;
      }
    },

    buyNode: async (nodeId) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('buy/', { node_id: nodeId });
        apply(res.data);
      } catch (err: any) {
        console.error('buy failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    sellNode: async (nodeId) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('sell/', { node_id: nodeId });
        apply(res.data);
      } catch (e: any) {
        console.error('sell failed', e.response?.status, e.response?.data);
      }
    },

    sellAll: async () => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('sell/', { all: true });
        apply(res.data);
      } catch (e: any) {
        console.error('sell all failed', e.response?.status, e.response?.data);
      }
    },

    // Collecting a coin: +1 gold, saved in batches.
    gather: () => {
      set((s) => ({
        currency: s.currency + s.prestigeMultiplier,
        pendingClicks: s.pendingClicks + 1,
      }));
      if (!clickTimer) clickTimer = setTimeout(flushClicks, 1500);
    },

    // Collecting a resource pickup: stock goes up now, the server is told in batches.
    collect: (nodeId) => {
      set((s) => ({
        ownedNodes: s.ownedNodes.map((n) =>
          n.id === nodeId ? { ...n, stock: n.stock + n.item_value } : n
        ),
        pendingCollects: { ...s.pendingCollects, [nodeId]: (s.pendingCollects[nodeId] ?? 0) + 1 },
      }));
      if (!collectTimer) collectTimer = setTimeout(flushCollects, 800);
    },

    dismissOfflineEarned: () => set({ offlineEarned: [] }),
  };
});
