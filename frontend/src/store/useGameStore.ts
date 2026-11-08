import { create } from 'zustand';
import API from '../services/api';

export interface OwnedNode {
  id: number;
  player_node_id: number | null;
  is_placeholder: boolean;
  instance_number: number;
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
  base_sell_price: number;
  market_multiplier: number;
  unlock_level: number;
  node: { id: number; name: string; icon: string; base_yield: number };
}

export interface OfflineEntry {
  resource: string;
  amount: number;
}

export type UpgradeType = 'spawn_amount' | 'node_amount';

export interface UpgradeState {
  level: number;
  max_level: number;
  point_cost: number;
  effect_value: number;
}

export interface HelperState {
  level: number;
  max_level: number;
  current_cost: number;
  speed_level: number;
  max_speed_level: number;
  speed_cost: number;
  pickup_interval: number;
  unlock_level: number;
}

export type HelperType = 'apple_picker' | 'wood_picker' | 'stone_picker' | 'tool_picker';

export interface QuestState {
  id: string; title: string; description: string; target: number; progress: number; reward: number; claimed: boolean;
}
export interface AchievementState {
  id: string; title: string; description: string; target: number; progress: number; reward: number;
  unlocked: boolean; claimed: boolean;
}
export interface MarketState { demand_resource: string; cycle_ends_at: string }
export interface BoostState { active: boolean; ends_at: string | null; cost: number; duration_seconds: number }

interface ServerState {
  currency: number;
  prestige_multiplier: number;
  offline_earned: OfflineEntry[];
  nodes: OwnedNode[];
  upgrades: Record<UpgradeType, UpgradeState>;
  helpers: Record<HelperType, HelperState>;
  player_level: number;
  level_xp: number;
  xp_to_next_level: number;
  upgrade_points: number;
  prestige_count: number;
  prestige_available: boolean;
  quests: QuestState[];
  achievements: AchievementState[];
  market: MarketState;
  boost: BoostState;
}

interface GameStore {
  currency: number;
  prestigeMultiplier: number;
  ownedNodes: OwnedNode[];
  upgrades: Record<UpgradeType, UpgradeState>;
  helpers: Record<HelperType, HelperState>;
  playerLevel: number;
  levelXp: number;
  xpToNextLevel: number;
  upgradePoints: number;
  prestigeCount: number;
  prestigeAvailable: boolean;
  quests: QuestState[];
  achievements: AchievementState[];
  market: MarketState;
  boost: BoostState;
  offlineEarned: OfflineEntry[];
  pendingClicks: number;
  pendingCollects: Record<number, number>;
  fetchGameState: () => Promise<boolean>;
  buyNode: (nodeId: number, action: 'purchase' | 'upgrade', playerNodeId?: number) => Promise<void>;
  buyUpgrade: (upgradeType: UpgradeType) => Promise<void>;
  buyHelper: (helperType: HelperType) => Promise<void>;
  upgradeHelperSpeed: (helperType: HelperType) => Promise<void>;
  claimQuest: (questId: string) => Promise<void>;
  claimAchievement: (achievementId: string) => Promise<void>;
  activateBoost: () => Promise<void>;
  prestige: () => Promise<void>;
  sellNode: (playerNodeId: number) => Promise<void>;
  sellAll: () => Promise<void>;
  gather: () => void;
  collect: (nodeId: number) => void;
  dismissOfflineEarned: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const xpForNextLevel = (level: number) => Math.ceil(50 * Math.pow(2.5, level));

  const advanceProgress = (level: number, xp: number, points: number, amount: number) => {
    xp += amount;
    while (xp >= xpForNextLevel(level)) {
      xp -= xpForNextLevel(level);
      level += 1;
      points += Math.ceil(level / 10);
    }
    return { level, xp, points, xpToNextLevel: xpForNextLevel(level) };
  };

  // Replace local state with what the server says (server is authoritative).
  const apply = (s: ServerState) =>
    set((prev) => {
      const pendingResourceXp = Object.entries(prev.pendingCollects).reduce((total, [id, count]) => {
        const node = prev.ownedNodes.find((ownedNode) => ownedNode.id === Number(id));
        return total + count * (node?.item_value ?? 0);
      }, 0);
      const pendingXp = prev.pendingClicks * (1 + s.prestige_multiplier / 50) + pendingResourceXp;
      const progress = advanceProgress(s.player_level, s.level_xp, s.upgrade_points, pendingXp);
      return {
        // Unsent coin clicks are added back so the number doesn't jump backwards.
        currency: s.currency + prev.pendingClicks * s.prestige_multiplier,
        prestigeMultiplier: s.prestige_multiplier,
        upgrades: s.upgrades,
        helpers: s.helpers,
        playerLevel: progress.level,
        levelXp: progress.xp,
        xpToNextLevel: progress.xpToNextLevel,
        upgradePoints: progress.points,
        prestigeCount: s.prestige_count,
        prestigeAvailable: s.prestige_available,
        quests: s.quests,
        achievements: s.achievements,
        market: s.market,
        boost: s.boost,
        // Same for collected pickups the server hasn't heard about yet.
        ownedNodes: s.nodes.map((n) => ({
          ...n,
          stock: n.stock + (prev.pendingCollects[n.id] ?? 0) * n.item_value,
        })),
        // Keep the "welcome back" banner until dismissed; only replace it with a new report.
        offlineEarned: s.offline_earned.length ? s.offline_earned : prev.offlineEarned,
      };
    });

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
      .map(([id, count]) => ({ player_node_id: Number(id), count }));
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
        for (const it of items) merged[it.player_node_id] = (merged[it.player_node_id] ?? 0) + it.count;
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
    upgrades: {
      spawn_amount: { level: 0, max_level: 10, point_cost: 1, effect_value: 1 },
      node_amount: { level: 0, max_level: 10, point_cost: 1, effect_value: 1 },
    },
    helpers: {
      apple_picker: { level: 0, max_level: 5, current_cost: 25, speed_level: 0, max_speed_level: 10, speed_cost: 50, pickup_interval: 10, unlock_level: 0 },
      wood_picker: { level: 0, max_level: 5, current_cost: 500, speed_level: 0, max_speed_level: 10, speed_cost: 1000, pickup_interval: 10, unlock_level: 2 },
      stone_picker: { level: 0, max_level: 5, current_cost: 5500, speed_level: 0, max_speed_level: 10, speed_cost: 11000, pickup_interval: 10, unlock_level: 4 },
      tool_picker: { level: 0, max_level: 5, current_cost: 60000, speed_level: 0, max_speed_level: 10, speed_cost: 120000, pickup_interval: 10, unlock_level: 6 },
    },
    playerLevel: 0,
    levelXp: 0,
    xpToNextLevel: 50,
    upgradePoints: 0,
    prestigeCount: 0,
    prestigeAvailable: false,
    quests: [],
    achievements: [],
    market: { demand_resource: 'Apples', cycle_ends_at: '' },
    boost: { active: false, ends_at: null, cost: 1000, duration_seconds: 300 },
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

    buyNode: async (nodeId, action, playerNodeId) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('buy/', {
          node_id: nodeId,
          action,
          player_node_id: playerNodeId,
        });
        apply(res.data);
      } catch (err: any) {
        console.error('buy failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    buyUpgrade: async (upgradeType) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('upgrade/', { upgrade_type: upgradeType });
        apply(res.data);
      } catch (err: any) {
        console.error('upgrade failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    buyHelper: async (helperType) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('helper/', { helper_type: helperType });
        apply(res.data);
      } catch (err: any) {
        console.error('helper purchase failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    upgradeHelperSpeed: async (helperType) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('helper/speed/', { helper_type: helperType });
        apply(res.data);
      } catch (err: any) {
        console.error('picker speed upgrade failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    claimQuest: async (questId) => {
      try {
        const res = await API.post<ServerState>('quest/claim/', { quest_id: questId });
        apply(res.data);
      } catch (err: any) {
        console.error('quest reward failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    claimAchievement: async (achievementId) => {
      try {
        const res = await API.post<ServerState>('achievement/claim/', { achievement_id: achievementId });
        apply(res.data);
      } catch (err: any) {
        console.error('achievement reward failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    activateBoost: async () => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('boost/');
        apply(res.data);
      } catch (err: any) {
        console.error('boost activation failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    prestige: async () => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('prestige/');
        apply(res.data);
        set({ pendingClicks: 0, pendingCollects: {} });
      } catch (err: any) {
        console.error('prestige failed', err.response?.status, err.response?.data);
        if (err.response?.data?.nodes) apply(err.response.data);
      }
    },

    sellNode: async (playerNodeId) => {
      await flushAll();
      try {
        const res = await API.post<ServerState>('sell/', { player_node_id: playerNodeId });
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

    // Collecting each coin grants one gold, adjusted by prestige.
    gather: () => {
      set((s) => ({
        currency: s.currency + s.prestigeMultiplier,
        pendingClicks: s.pendingClicks + 1,
        ...(() => {
          const progress = advanceProgress(
            s.playerLevel,
            s.levelXp,
            s.upgradePoints,
            1 + s.prestigeMultiplier / 50
          );
          return {
            playerLevel: progress.level,
            levelXp: progress.xp,
            xpToNextLevel: progress.xpToNextLevel,
            upgradePoints: progress.points,
          };
        })(),
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
        ...(() => {
          const progress = advanceProgress(
            s.playerLevel,
            s.levelXp,
            s.upgradePoints,
            s.ownedNodes.find((n) => n.id === nodeId)?.item_value ?? 0
          );
          return {
            playerLevel: progress.level,
            levelXp: progress.xp,
            xpToNextLevel: progress.xpToNextLevel,
            upgradePoints: progress.points,
          };
        })(),
      }));
      if (!collectTimer) collectTimer = setTimeout(flushCollects, 800);
    },

    dismissOfflineEarned: () => set({ offlineEarned: [] }),
  };
});
