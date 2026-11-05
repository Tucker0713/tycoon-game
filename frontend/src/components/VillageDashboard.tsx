import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { CurrencyTicker } from './CurrencyTicker';
import { Market } from './Market';
import { CoinField, Pickup, MAX_PICKUPS, MAX_PER_NODE } from './CoinField';
import { Hammer, Trees, Pickaxe, Citrus, Sparkles } from 'lucide-react';

const fmt = (v: number) => Number(v.toFixed(1));

export const VillageDashboard: React.FC = () => {
    const { currency, ownedNodes, offlineEarned, fetchGameState, buyNode, gather, collect, dismissOfflineEarned } =
        useGameStore();

    // Everything currently sitting in the box: coins and resource pickups.
    const [pickups, setPickups] = useState<Pickup[]>([]);
    const pickupsRef = useRef<Pickup[]>([]);
    pickupsRef.current = pickups;

    const nextId = useRef(0);
    // Per-producer output that has been made but not yet turned into a pickup on the field.
    const uncollected = useRef<Record<number, number>>({});
    const seeded = useRef(false);
    const lastTick = useRef(performance.now());

    const makePickup = (nodeId: number | null, icon: string, label: string): Pickup => ({
        id: nextId.current++,
        x: 8 + Math.random() * 84, // keep items away from the edges
        y: 8 + Math.random() * 84,
        nodeId,
        icon,
        label,
    });

    // Load state from the server, and the first time only, seed the backlog from what's waiting there.
    useEffect(() => {
        let cancelled = false;
        const sync = async () => {
            const ok = await fetchGameState();
            if (!ok || cancelled || seeded.current) return;
            for (const n of useGameStore.getState().ownedNodes) {
                uncollected.current[n.id] = n.pending;
            }
            seeded.current = true;
            lastTick.current = performance.now();
        };
        sync();
        // Re-sync every 30s so the client can't drift far from the server.
        const id = setInterval(sync, 30000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [fetchGameState]);

    // Passive spawning: each owned producer turns its output into a pickup every few seconds.
    useEffect(() => {
        const id = setInterval(() => {
            const now = performance.now();
            const dt = (now - lastTick.current) / 1000; // real elapsed time, so background tabs catch up
            lastTick.current = now;
            if (!seeded.current) return;

            const nodes = useGameStore.getState().ownedNodes;
            const current = pickupsRef.current;
            let total = current.length;
            const spawned: Pickup[] = [];

            for (const n of nodes) {
                if (n.level <= 0 || n.item_value <= 0) continue;
                let bucket = (uncollected.current[n.id] ?? 0) + n.yield_per_sec * dt;
                let onField = current.filter((p) => p.nodeId === n.id).length;
                while (bucket >= n.item_value && onField < MAX_PER_NODE && total < MAX_PICKUPS) {
                    bucket -= n.item_value;
                    spawned.push(makePickup(n.id, n.node.icon, n.resource_label));
                    onField++;
                    total++;
                }
                uncollected.current[n.id] = bucket; // leftovers wait until there's room
            }

            if (spawned.length) setPickups((prev) => [...prev, ...spawned]);
        }, 500);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const spawnCoin = () => {
        const coin = makePickup(null, 'coin', 'Coin');
        setPickups((prev) => (prev.length >= MAX_PICKUPS ? prev : [...prev, coin]));
    };

    const collectPickup = (p: Pickup) => {
        setPickups((prev) => prev.filter((x) => x.id !== p.id));
        if (p.nodeId === null) gather();      // coin: +1 gold
        else collect(p.nodeId);               // resource: stock goes up
    };

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case 'apple':
            case 'citrus':
                return <Citrus className="w-8 h-8 text-amber-400" />;
            case 'tree':
                return <Trees className="w-8 h-8 text-emerald-400" />;
            case 'mountain':
                return <Pickaxe className="w-8 h-8 text-slate-400" />;
            default:
                return <Hammer className="w-8 h-8 text-amber-500" />;
        }
    };

    return (
        <div className="relative min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center">
            <header className="mb-6 text-center">
                <h1 className="text-4xl font-extrabold text-amber-500 tracking-tight flex items-center justify-center gap-2">
                    🏰 Village Simulator
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    Expand your settlement and boost resource production
                </p>
            </header>

            {offlineEarned.length > 0 && (
                <div className="w-full max-w-md mb-4 p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-emerald-300 text-sm flex justify-between items-center gap-3">
                    <span>
                        Welcome back! While you were away your village produced:{' '}
                        {offlineEarned.map((e) => `${e.amount.toFixed(1)} ${e.resource}`).join(', ')}. Click the
                        pickups to collect them!
                    </span>
                    <button onClick={dismissOfflineEarned} className="text-xs underline cursor-pointer shrink-0">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="fixed top-14 right-4 z-40 w-56">
                <CurrencyTicker />
            </div>

            <div className="relative w-full max-w-[120rem]">
                {/* Producer shop and Market stay together in the left sidebar. */}
                <div className="w-full flex flex-col gap-4 2xl:absolute 2xl:left-0 2xl:top-0 2xl:w-[30rem]">
                    <div className="grid grid-cols-2 gap-4">
                    {ownedNodes.map((item) => {
                        const atMaxLevel = item.level >= item.max_level;
                        const canAfford = currency >= item.current_cost && !atMaxLevel;
                        const label = item.resource_label.toLowerCase();

                        return (
                            <div
                                key={item.id}
                                className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 shadow-md hover:border-amber-500/50 transition duration-200 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="p-2 bg-slate-700/50 rounded-lg">
                                            {getIcon(item.node.icon)}
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-wider bg-slate-700 px-2 py-1 rounded-full text-slate-300">
                                            Lvl {item.level} / {item.max_level}
                                        </span>
                                    </div>

                                    <h3 className="text-base font-bold text-slate-100">{item.node.name}</h3>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {item.level === 0
                                            ? `Spawns ${fmt(item.node.base_yield * item.spawn_interval)} ${label} every ${item.spawn_interval}s per level`
                                            : `Spawns ${fmt(item.item_value)} ${label} every ${item.spawn_interval}s`}
                                    </p>
                                </div>

                                <div className="mt-4">
                                    <button
                                        onClick={() => buyNode(item.node.id)}
                                        disabled={!canAfford}
                                        className={`w-full py-2 px-3 rounded-lg font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
                                            canAfford
                                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg cursor-pointer active:scale-95'
                                                : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                        }`}
                                    >
                                        <span>{atMaxLevel ? 'Max Level' : item.level === 0 ? 'Buy' : 'Upgrade'}</span>
                                        {!atMaxLevel && (
                                            <span className="text-xs opacity-90">
                                                (🌾 {item.current_cost.toFixed(1)})
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                    <Market />
                </div>

                <section className="w-full max-w-2xl mx-auto flex flex-col items-center gap-5">
                    <button
                        onClick={spawnCoin}
                        className="px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-lg rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
                    >
                        <Sparkles className="w-6 h-6" />
                        Spawn Coins
                    </button>
                    <CoinField pickups={pickups} onCollect={collectPickup} />
                </section>
            </div>
        </div>
    );
};
