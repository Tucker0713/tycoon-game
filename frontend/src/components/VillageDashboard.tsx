import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { CurrencyTicker } from './CurrencyTicker';
import { Market } from './Market';
import { CoinField, Pickup, PickerWorker, MAX_PICKUPS, MAX_PER_NODE } from './CoinField';
import { Hammer, Trees, Pickaxe, Citrus, Sparkles, X, BookOpen } from 'lucide-react';

const fmt = (v: number) => Number(v.toFixed(1));

const helperCards = [
    { type: 'apple_picker' as const, name: 'Apple Picker', icon: 'apple', item: 'apple', plural: 'apples', source: 'Apple Orchard' },
    { type: 'wood_picker' as const, name: 'Wood Picker', icon: 'tree', item: 'wood', plural: 'wood', source: 'Lumber Camp' },
    { type: 'stone_picker' as const, name: 'Stone Picker', icon: 'mountain', item: 'stone', plural: 'stones', source: 'Stone Quarry' },
    { type: 'tool_picker' as const, name: 'Tool Picker', icon: 'hammer', item: 'tool', plural: 'tools', source: 'Blacksmith' },
];

const tutorialSteps = [
    {
        title: 'Coins and the board',
        body: 'Press Spawn Coins, then click the coins on the board to earn gold. Your Coins per Click upgrade can spawn several coins with each press.',
    },
    {
        title: 'Producers',
        body: 'Buy an orchard, lumber camp, quarry, or blacksmith with gold. Producers create resource pickups over time; upgrading them makes each item arrive sooner. Resource Copies unlock extra copies of each producer.',
    },
    {
        title: 'Pickers',
        body: 'Hire up to five of each picker type in Upgrades → Pickers. The Helpers cards on the right improve pickup speed. Each worker travels to matching resource pickups and collects them when it arrives.',
    },
    {
        title: 'Market and levels',
        body: 'Collected resources go into your stock. Sell them one at a time or use Sell All. The high-demand resource changes every six hours. Clicking, collecting, and selling earn XP; each player level awards upgrade points.',
    },
    {
        title: 'Upgrades, quests, and achievements',
        body: 'Spend upgrade points in the Upgrades window: Self boosts coins per click, Resource Nodes unlocks producer copies, and Pickers hires more workers. The main-board Helpers cards spend gold to improve their pickup speed. Daily Contracts and Achievements give extra gold when you claim their rewards.',
    },
    {
        title: 'Boosts and prestige',
        body: 'A Production Boost costs 1,000 gold and doubles producer output for five minutes. Lumber, Stone, and Tools unlock at player levels 2, 4, and 6. At level 10, Prestige restarts your run for a permanent multiplier bonus; the game confirms before resetting.',
    },
];

interface PickerRoute {
    pickup: Pickup;
    timeoutId: number;
}

type UpgradeTab = 'self' | 'resource_nodes' | 'pickers';

interface VillageDashboardProps { username: string }

export const VillageDashboard: React.FC<VillageDashboardProps> = ({ username }) => {
    const { currency, ownedNodes, upgrades, helpers, playerLevel, levelXp, xpToNextLevel, upgradePoints, offlineEarned, prestigeCount, prestigeAvailable, quests, achievements, market, boost, fetchGameState, buyNode, buyUpgrade, buyHelper, upgradeHelperSpeed, claimQuest, claimAchievement, activateBoost, prestige, gather, collect, dismissOfflineEarned } =
        useGameStore();

    // Everything currently sitting in the box: coins and resource pickups.
    const [pickups, setPickups] = useState<Pickup[]>([]);
    const [upgradesOpen, setUpgradesOpen] = useState(false);
    const [achievementsOpen, setAchievementsOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(0);
    const [activeUpgradeTab, setActiveUpgradeTab] = useState<UpgradeTab>('self');
    const [clockNow, setClockNow] = useState(Date.now());
    const pickupsRef = useRef<Pickup[]>([]);
    pickupsRef.current = pickups;
    const helpersRef = useRef(helpers);
    helpersRef.current = helpers;
    const pickerPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
    const pickerRoutesRef = useRef(new Map<string, PickerRoute>());
    const [pickerPositions, setPickerPositions] = useState<Record<string, PickerWorker>>({});
    const previousPrestigeCount = useRef(prestigeCount);
    const dashboardLayoutRef = useRef<HTMLDivElement>(null);
    const producerSidebarRef = useRef<HTMLDivElement>(null);
    const firstProducerCardRef = useRef<HTMLDivElement>(null);
    const marketBlockRef = useRef<HTMLDivElement>(null);
    const [helperTop, setHelperTop] = useState(0);
    const [marketTop, setMarketTop] = useState(0);

    const nextId = useRef(0);
    // Per-producer output that has been made but not yet turned into a pickup on the field.
    const uncollected = useRef<Record<number, number>>({});
    const seeded = useRef(false);
    const lastTick = useRef(performance.now());

    useEffect(() => {
        const seenKey = `villageTutorialSeen:${username}`;
        if (localStorage.getItem(seenKey) !== 'true') {
            setTutorialStep(0);
            setTutorialOpen(true);
        }
    }, [username]);

    const closeTutorial = () => {
        localStorage.setItem(`villageTutorialSeen:${username}`, 'true');
        setTutorialOpen(false);
    };

    useEffect(() => {
        const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!boost.active || !boost.ends_at) return;
        const timeout = window.setTimeout(() => void fetchGameState(), Math.max(0, new Date(boost.ends_at).getTime() - Date.now()) + 250);
        return () => window.clearTimeout(timeout);
    }, [boost.active, boost.ends_at, fetchGameState]);

    useEffect(() => {
        if (prestigeCount > previousPrestigeCount.current) {
            setPickups([]);
            uncollected.current = {};
        }
        previousPrestigeCount.current = prestigeCount;
    }, [prestigeCount]);

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
        const spawnCount = upgrades.spawn_amount.effect_value;
        const coins = Array.from({ length: spawnCount }, () => makePickup(null, 'coin', 'Coin'));
        setPickups((prev) => [...prev, ...coins].slice(0, MAX_PICKUPS));
    };

    const collectPickup = (p: Pickup) => {
        setPickups((prev) => prev.filter((x) => x.id !== p.id));
        if (p.nodeId === null) gather();      // coin: +1 gold
        else collect(p.nodeId);               // resource: stock goes up
    };

    useEffect(() => {
        const planPickerTrips = () => {
            const activeWorkers = helperCards.flatMap((helper, helperIndex) => {
                const count = helpersRef.current[helper.type].level;
                return Array.from({ length: count }, (_, pickerIndex) => ({
                    id: `${helper.type}-${pickerIndex + 1}`,
                    name: helper.name,
                    icon: helper.icon,
                    helperType: helper.type,
                    x: 12 + helperIndex * 25 + (pickerIndex - (count - 1) / 2) * 4,
                    y: 92,
                }));
            });
            const activeWorkerIds = new Set(activeWorkers.map((worker) => worker.id));

            for (const [workerId, route] of pickerRoutesRef.current) {
                if (!activeWorkerIds.has(workerId)) {
                    window.clearTimeout(route.timeoutId);
                    pickerRoutesRef.current.delete(workerId);
                }
            }

            setPickerPositions((current) => {
                let changed = false;
                const next = { ...current };
                for (const worker of activeWorkers) {
                    if (next[worker.id]) continue;
                    const position = pickerPositionsRef.current[worker.id] ?? { x: worker.x, y: worker.y };
                    pickerPositionsRef.current[worker.id] = position;
                    next[worker.id] = { ...worker, ...position, travelSeconds: 0 };
                    changed = true;
                }
                for (const workerId of Object.keys(next)) {
                    if (activeWorkerIds.has(workerId)) continue;
                    delete next[workerId];
                    delete pickerPositionsRef.current[workerId];
                    changed = true;
                }
                return changed ? next : current;
            });

            const reservedPickupIds = new Set(
                Array.from(pickerRoutesRef.current.values(), (route) => route.pickup.id)
            );

            for (const worker of activeWorkers) {
                if (pickerRoutesRef.current.has(worker.id)) continue;

                const isNewWorker = !pickerPositionsRef.current[worker.id];
                const currentPosition = pickerPositionsRef.current[worker.id] ?? { x: worker.x, y: worker.y };
                if (isNewWorker) {
                    // Let the worker render at its home position before starting its first trip.
                    pickerPositionsRef.current[worker.id] = currentPosition;
                    continue;
                }
                const pickup = pickupsRef.current
                    .filter((item) => item.icon === worker.icon && item.nodeId !== null && !reservedPickupIds.has(item.id))
                    .sort((a, b) => {
                        const distanceA = (a.x - currentPosition.x) ** 2 + (a.y - currentPosition.y) ** 2;
                        const distanceB = (b.x - currentPosition.x) ** 2 + (b.y - currentPosition.y) ** 2;
                        return distanceA - distanceB;
                    })[0];

                if (!pickup || pickup.nodeId === null) continue;

                reservedPickupIds.add(pickup.id);
                const travelSeconds = helpersRef.current[worker.helperType].pickup_interval;
                pickerPositionsRef.current[worker.id] = { x: pickup.x, y: pickup.y };
                setPickerPositions((current) => ({
                    ...current,
                    [worker.id]: { ...worker, x: pickup.x, y: pickup.y, travelSeconds },
                }));

                const route: PickerRoute = { pickup, timeoutId: 0 };
                route.timeoutId = window.setTimeout(() => {
                    if (pickerRoutesRef.current.get(worker.id) !== route) return;
                    pickerRoutesRef.current.delete(worker.id);

                    const targetStillExists = pickupsRef.current.some((item) => item.id === pickup.id);
                    if (targetStillExists && pickup.nodeId !== null) {
                        setPickups((current) => current.filter((item) => item.id !== pickup.id));
                        collect(pickup.nodeId);
                    }

                    setPickerPositions((current) => ({
                        ...current,
                        [worker.id]: { ...worker, x: pickup.x, y: pickup.y, travelSeconds: 0 },
                    }));
                }, travelSeconds * 1000);
                pickerRoutesRef.current.set(worker.id, route);
            }
        };

        const planningInterval = window.setInterval(planPickerTrips, 100);
        return () => {
            window.clearInterval(planningInterval);
            for (const route of pickerRoutesRef.current.values()) window.clearTimeout(route.timeoutId);
            pickerRoutesRef.current.clear();
        };
    }, [collect]);

    useLayoutEffect(() => {
        const updateHelperPosition = () => {
            const layout = dashboardLayoutRef.current;
            const orchardCard = firstProducerCardRef.current;
            const marketBlock = marketBlockRef.current;
            if (!layout) return;

            if (orchardCard) {
                setHelperTop(orchardCard.getBoundingClientRect().top - layout.getBoundingClientRect().top);
            }
            if (marketBlock) {
                setMarketTop(marketBlock.getBoundingClientRect().top - layout.getBoundingClientRect().top);
            }
        };

        updateHelperPosition();
        const observer = new ResizeObserver(updateHelperPosition);
        if (producerSidebarRef.current) observer.observe(producerSidebarRef.current);
        window.addEventListener('resize', updateHelperPosition);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHelperPosition);
        };
    }, []);

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

    const pickerWorkers: PickerWorker[] = helperCards.flatMap((helper, helperIndex) => {
        const count = helpers[helper.type].level;
        return Array.from({ length: count }, (_, pickerIndex) => {
            const id = `${helper.type}-${pickerIndex + 1}`;
            const x = 12 + helperIndex * 25 + (pickerIndex - (count - 1) / 2) * 4;
            const position = pickerPositions[id];
            return {
                id,
                name: helper.name,
                icon: helper.icon,
                x: position?.x ?? x,
                y: position?.y ?? 92,
                travelSeconds: position?.travelSeconds ?? 0,
            };
        });
    });
    const boostRemaining = boost.ends_at
        ? Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - clockNow) / 1000))
        : 0;
    const boostTimer = `${Math.floor(boostRemaining / 60)}:${String(boostRemaining % 60).padStart(2, '0')}`;

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

            <div ref={dashboardLayoutRef} className="relative w-full max-w-[120rem]">
                {/* Producer shop and Market stay together in the left sidebar. */}
                <div ref={producerSidebarRef} className="w-full flex flex-col gap-4 2xl:absolute 2xl:left-0 2xl:top-0 2xl:w-[30rem]">
                    <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-md">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="font-bold text-slate-100">Level {playerLevel}</span>
                            <span className="text-sm font-semibold text-amber-300">{upgradePoints} upgrade points</span>
                        </div>
                        <div
                            className="h-2 overflow-hidden rounded-full bg-slate-950/70"
                            role="progressbar"
                            aria-label="Level progress"
                            aria-valuemin={0}
                            aria-valuemax={xpToNextLevel}
                            aria-valuenow={levelXp}
                        >
                            <div
                                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${Math.min(100, (levelXp / xpToNextLevel) * 100)}%` }}
                            />
                        </div>
                        <p className="mt-1 text-right text-xs text-slate-400">
                            {levelXp.toFixed(1)} / {xpToNextLevel} XP
                        </p>
                    </div>
                    <div ref={marketBlockRef}>
                        <Market />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4">
                    {ownedNodes.map((item, index) => {
                        const atMaxLevel = !item.is_placeholder && item.level >= item.max_level;
                        const isLocked = playerLevel < item.unlock_level;
                        const canAfford = currency >= item.current_cost && !atMaxLevel && !isLocked;
                        const label = item.resource_label.toLowerCase();

                        return (
                            <div
                                key={item.id}
                                ref={index === 0 ? firstProducerCardRef : undefined}
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

                                    <h3 className="text-base font-bold text-slate-100">
                                        {item.node.name}{item.instance_number > 1 ? ` #${item.instance_number}` : ''}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {isLocked
                                            ? `Unlocks at player level ${item.unlock_level}`
                                            : item.level === 0
                                            ? `Spawns ${fmt(item.node.base_yield * item.spawn_interval)} ${label} every ${item.spawn_interval}s per level`
                                            : `Spawns 1 ${label} every ${fmt(item.item_value / item.yield_per_sec)}s`}
                                    </p>
                                </div>

                                <div className="mt-4">
                                    <button
                                        onClick={() => item.is_placeholder
                                            ? buyNode(item.node.id, 'purchase')
                                            : buyNode(item.node.id, 'upgrade', item.player_node_id ?? undefined)}
                                        disabled={!canAfford}
                                        className={`w-full py-2 px-3 rounded-lg font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
                                            canAfford
                                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg cursor-pointer active:scale-95'
                                                : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                        }`}
                                    >
                                        <span>{isLocked ? `Unlock at Level ${item.unlock_level}` : atMaxLevel ? 'Max Level' : item.is_placeholder ? 'Buy' : 'Upgrade'}</span>
                                        {!atMaxLevel && !isLocked && (
                                            <span className="text-xs opacity-90">
                                                (🪙 {item.current_cost.toFixed(1)})
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>

                <section className="w-full max-w-2xl mx-auto flex flex-col items-center gap-5">
                    <div className="flex flex-wrap justify-center gap-4">
                        <button
                            onClick={spawnCoin}
                            className="px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-lg rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
                        >
                            <Sparkles className="w-6 h-6" />
                            Spawn Coins
                        </button>
                        <button
                            onClick={() => setUpgradesOpen(true)}
                            aria-haspopup="dialog"
                            className="px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-lg rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
                        >
                            <Sparkles className="w-6 h-6" />
                            Upgrades
                        </button>
                        <button
                            onClick={() => { setTutorialStep(0); setTutorialOpen(true); }}
                            aria-haspopup="dialog"
                            className="px-5 py-3 border border-slate-600 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-bold rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
                        >
                            <BookOpen className="w-5 h-5" />
                            How to Play
                        </button>
                    </div>
                    <CoinField pickups={pickups} workers={pickerWorkers} onCollect={collectPickup} />
                    <div className="grid w-full gap-4 rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-md lg:grid-cols-[1fr_15rem]">
                        <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-bold text-slate-100">Daily Contracts</h2>
                                    <p className="text-xs text-slate-400">Complete these goals for bonus gold. They refresh each day.</p>
                                </div>
                                <button onClick={() => setAchievementsOpen(true)} className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
                                    Achievements
                                </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {quests.map((quest) => {
                                    const complete = quest.progress >= quest.target;
                                    return (
                                        <article key={quest.id} className="rounded-lg bg-slate-900/70 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="text-sm font-semibold text-slate-100">{quest.title}</h3>
                                                <span className="whitespace-nowrap text-xs text-amber-300">+{quest.reward} 🪙</span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-400">{quest.description}</p>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                                                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }} />
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                                                <span>{Math.floor(quest.progress)} / {quest.target}</span>
                                                {quest.claimed ? <span className="text-emerald-300">Claimed</span> : complete ? (
                                                    <button onClick={() => claimQuest(quest.id)} className="font-semibold text-amber-300 hover:text-amber-200">Claim</button>
                                                ) : <span>In progress</span>}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                        <aside className="flex flex-col justify-center rounded-lg bg-slate-900/70 p-4">
                            <h3 className="font-semibold text-slate-100">Production Boost</h3>
                            <p className="mt-1 text-xs text-slate-400">
                                Double producer output for 5 minutes. Costs {boost.cost.toLocaleString()} gold.
                            </p>
                            <button
                                onClick={activateBoost}
                                disabled={boostRemaining > 0 || currency < boost.cost}
                                className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${boostRemaining > 0 || currency < boost.cost ? 'cursor-not-allowed bg-slate-700 text-slate-500' : 'bg-amber-600 text-white hover:bg-amber-500'}`}
                            >
                                {boostRemaining > 0 ? `Active · ${boostTimer}` : `Activate · ${boost.cost.toLocaleString()} 🪙`}
                            </button>
                        </aside>
                    </div>
                </section>

                <div style={{ top: marketTop }} className="mt-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-md 2xl:absolute 2xl:right-0 2xl:mt-0 2xl:w-64 2xl:max-w-none min-[1800px]:w-[30rem]">
                    <h2 className="text-lg font-bold text-slate-100">Helpers</h2>
                </div>
                <aside style={{ top: helperTop }} className="mt-4 w-full max-w-sm 2xl:absolute 2xl:right-0 2xl:mt-0 2xl:w-64 2xl:max-w-none min-[1800px]:w-[30rem]">
                    <div className="flex flex-col gap-4">
                        {helperCards.map((helper) => {
                            const state = helpers[helper.type];
                            const atMaxSpeed = state.speed_level >= state.max_speed_level;
                            const isLocked = playerLevel < state.unlock_level;
                            const canAfford = currency >= state.speed_cost && !atMaxSpeed && !isLocked && state.level > 0;

                            return (
                                <div key={helper.type} className="flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-md transition duration-200 hover:border-amber-500/50">
                                    <div>
                                        <div className="mb-3 flex items-center justify-between">
                                            <div className="rounded-lg bg-slate-700/50 p-2">
                                                {getIcon(helper.icon)}
                                            </div>
                                            <span className="rounded-full bg-slate-700 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">
                                                Speed {state.speed_level} / {state.max_speed_level}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-bold text-slate-100">{helper.name}</h3>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {isLocked
                                                ? `Unlocks at player level ${state.unlock_level}.`
                                                : state.level > 0
                                                ? `${state.level} / ${state.max_level} pickers · Each collects 1 ${helper.item} per ${fmt(state.pickup_interval)}s.${atMaxSpeed ? '' : ` Next level: ${fmt(state.pickup_interval * 0.9)}s.`}`
                                                : `Hire this picker in Upgrades → Pickers first. Speed upgrades reduce its ${helper.item} pickup time.`}
                                        </p>
                                    </div>
                                    <div className="mt-4">
                                        <button
                                            onClick={() => upgradeHelperSpeed(helper.type)}
                                            disabled={!canAfford}
                                            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                                                canAfford
                                                    ? 'bg-amber-600 text-white shadow-lg hover:bg-amber-500 active:scale-95'
                                                    : 'cursor-not-allowed bg-slate-700 text-slate-500 opacity-60'
                                            }`}
                                        >
                                            <span>{isLocked ? `Unlock at Level ${state.unlock_level}` : state.level === 0 ? 'Hire from Upgrades first' : atMaxSpeed ? 'Max Speed' : 'Upgrade Speed'}</span>
                                            {!atMaxSpeed && !isLocked && state.level > 0 && <span className="text-xs opacity-90">(🪙 {state.speed_cost.toFixed(1)})</span>}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            </div>

            {tutorialOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={closeTutorial}>
                    <section role="dialog" aria-modal="true" aria-labelledby="tutorial-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <header className="flex items-start justify-between border-b border-slate-700 px-6 py-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Village Simulator · {tutorialStep + 1} of {tutorialSteps.length}</p>
                                <h2 id="tutorial-title" className="mt-1 text-xl font-bold text-slate-100">{tutorialSteps[tutorialStep].title}</h2>
                            </div>
                            <button onClick={closeTutorial} aria-label="Close tutorial" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"><X className="h-5 w-5" /></button>
                        </header>
                        <div className="p-6">
                            <p className="min-h-20 text-sm leading-6 text-slate-300">{tutorialSteps[tutorialStep].body}</p>
                            <div className="mt-5 flex items-center justify-center gap-2" aria-label={`Tutorial step ${tutorialStep + 1} of ${tutorialSteps.length}`}>
                                {tutorialSteps.map((step, index) => (
                                    <span key={step.title} className={`h-2 rounded-full transition-all ${index === tutorialStep ? 'w-6 bg-amber-400' : 'w-2 bg-slate-600'}`} />
                                ))}
                            </div>
                        </div>
                        <footer className="flex items-center justify-between border-t border-slate-700 px-6 py-4">
                            <button onClick={closeTutorial} className="text-sm font-semibold text-slate-400 hover:text-slate-200">Skip tutorial</button>
                            <div className="flex gap-2">
                                <button onClick={() => setTutorialStep((step) => Math.max(0, step - 1))} disabled={tutorialStep === 0} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Back</button>
                                {tutorialStep < tutorialSteps.length - 1 ? (
                                    <button onClick={() => setTutorialStep((step) => Math.min(tutorialSteps.length - 1, step + 1))} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">Next</button>
                                ) : (
                                    <button onClick={closeTutorial} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">Start Playing</button>
                                )}
                            </div>
                        </footer>
                    </section>
                </div>
            )}

            {upgradesOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
                    onClick={() => setUpgradesOpen(false)}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="upgrades-title"
                        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
                            <h2 id="upgrades-title" className="text-xl font-bold text-slate-100">
                                Personal Upgrades
                            </h2>
                            <button
                                onClick={() => setUpgradesOpen(false)}
                                aria-label="Close upgrades"
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </header>
                        <div className="border-b border-slate-700 px-6 pt-4">
                            <div role="tablist" aria-label="Upgrade categories" className="flex gap-2">
                                {([
                                    { id: 'self', label: 'Self' },
                                    { id: 'resource_nodes', label: 'Resource Nodes' },
                                    { id: 'pickers', label: 'Pickers' },
                                ] as const).map((tab) => (
                                    <button
                                        key={tab.id}
                                        role="tab"
                                        aria-selected={activeUpgradeTab === tab.id}
                                        onClick={() => setActiveUpgradeTab(tab.id)}
                                        className={`border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${
                                            activeUpgradeTab === tab.id
                                                ? 'border-amber-500 text-amber-400'
                                                : 'border-transparent text-slate-400 hover:text-slate-100'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div role="tabpanel" className="max-h-[65vh] min-h-48 overflow-y-auto p-6">
                            {activeUpgradeTab === 'pickers' ? (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {helperCards.map((helper) => {
                                        const state = helpers[helper.type];
                                        const atMaxLevel = state.level >= state.max_level;
                                        const isLocked = playerLevel < state.unlock_level;
                                        const canAfford = currency >= state.current_cost && !atMaxLevel && !isLocked;

                                        return (
                                            <article key={helper.type} className="flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900/70 p-4 shadow-md">
                                                <div>
                                                    <div className="mb-3 flex items-center justify-between gap-2">
                                                        <h3 className="font-bold text-slate-100">{helper.name}</h3>
                                                        <span className="shrink-0 rounded-full bg-slate-700 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">
                                                            {state.level} / {state.max_level} Pickers
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400">
                                                        {isLocked
                                                            ? `Unlocks at player level ${state.unlock_level}.`
                                                            : state.level > 0
                                                            ? `Each of your ${state.level} picker${state.level === 1 ? '' : 's'} travels to collect 1 ${helper.item} in ${fmt(state.pickup_interval)}s.`
                                                            : `Hire a helper to automatically collect ${helper.plural} from the ${helper.source}.`}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => buyHelper(helper.type)}
                                                    disabled={!canAfford}
                                                    className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                                                        canAfford
                                                            ? 'bg-amber-600 text-white shadow-lg hover:bg-amber-500 active:scale-95'
                                                            : 'cursor-not-allowed bg-slate-700 text-slate-500 opacity-60'
                                                    }`}
                                                >
                                                    {isLocked ? `Unlock at Level ${state.unlock_level}` : atMaxLevel ? 'Max Pickers' : `${state.level === 0 ? 'Hire Picker' : 'Hire Another'} (🪙 ${state.current_cost.toFixed(1)})`}
                                                </button>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {(activeUpgradeTab === 'self'
                                        ? [{
                                            type: 'spawn_amount' as const,
                                            title: 'Coins per Click',
                                            description: 'Spawn more collectible coins each time you press Spawn Coins.',
                                            unit: 'coins per click',
                                        }]
                                        : [{
                                            type: 'node_amount' as const,
                                            title: 'Resource Copies',
                                            description: 'Unlock one additional purchase slot for every resource type.',
                                            unit: 'copies of each resource',
                                        }]
                                    ).map((upgrade) => {
                                        const state = upgrades[upgrade.type];
                                        const atMaxLevel = state.level >= state.max_level;
                                        const canAfford = upgradePoints >= state.point_cost && !atMaxLevel;
                                        const nextValue = state.effect_value + 1;

                                        return (
                                            <article key={upgrade.type} className="flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900/70 p-4 shadow-md">
                                                <div>
                                                    <div className="mb-3 flex items-center justify-between gap-2">
                                                        <h3 className="font-bold text-slate-100">{upgrade.title}</h3>
                                                        <span className="shrink-0 rounded-full bg-slate-700 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">
                                                            Lvl {state.level} / {state.max_level}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400">{upgrade.description}</p>
                                                    <p className="mt-2 text-sm font-semibold text-amber-300">
                                                        {state.effect_value}
                                                        {!atMaxLevel && ` → ${nextValue}`} {upgrade.unit}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => buyUpgrade(upgrade.type)}
                                                    disabled={!canAfford}
                                                    className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                                                        canAfford
                                                            ? 'bg-amber-600 text-white shadow-lg hover:bg-amber-500 active:scale-95'
                                                            : 'cursor-not-allowed bg-slate-700 text-slate-500 opacity-60'
                                                    }`}
                                                >
                                                    {atMaxLevel ? 'Max Level' : `Upgrade (${state.point_cost} point${state.point_cost === 1 ? '' : 's'})`}
                                                </button>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {achievementsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setAchievementsOpen(false)}>
                    <section role="dialog" aria-modal="true" aria-labelledby="achievements-title" className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
                            <div>
                                <h2 id="achievements-title" className="text-xl font-bold text-slate-100">Achievements</h2>
                                <p className="text-xs text-slate-400">Milestones stay with your account, including after prestige.</p>
                            </div>
                            <button onClick={() => setAchievementsOpen(false)} aria-label="Close achievements" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"><X className="h-5 w-5" /></button>
                        </header>
                        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-6">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {achievements.map((achievement) => (
                                    <article key={achievement.id} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="font-bold text-slate-100">{achievement.title}</h3>
                                                <p className="mt-1 text-xs text-slate-400">{achievement.description}</p>
                                            </div>
                                            <span className="shrink-0 text-xs text-amber-300">+{achievement.reward} 🪙</span>
                                        </div>
                                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (achievement.progress / achievement.target) * 100)}%` }} /></div>
                                        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                                            <span>{Math.floor(achievement.progress)} / {achievement.target}</span>
                                            {achievement.claimed ? <span className="text-emerald-300">Claimed</span> : achievement.unlocked ? <button onClick={() => claimAchievement(achievement.id)} className="font-semibold text-amber-300 hover:text-amber-200">Claim reward</button> : <span>Locked</span>}
                                        </div>
                                    </article>
                                ))}
                            </div>
                            <article className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-bold text-amber-200">Prestige {prestigeCount > 0 ? `· ${prestigeCount} completed` : ''}</h3>
                                        <p className="mt-1 text-sm text-slate-300">Reach player level 10 to restart with a permanent +0.5 production and coin bonus multiplier. Prestige resets your gold, levels, producers, pickers, and personal upgrades; achievements remain.</p>
                                        <p className="mt-2 text-xs text-slate-400">Current multiplier: ×{prestigeCount > 0 ? (1 + prestigeCount * 0.5).toFixed(1) : '1.0'}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (prestigeAvailable && window.confirm('Prestige now? This resets your gold, producers, pickers, player level, and upgrades in exchange for a permanent +0.5 multiplier. Achievements are kept.')) prestige();
                                        }}
                                        disabled={!prestigeAvailable}
                                        className={`rounded-lg px-4 py-2 text-sm font-bold ${prestigeAvailable ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'cursor-not-allowed bg-slate-700 text-slate-500'}`}
                                    >
                                        {prestigeAvailable ? 'Prestige' : `Unlock at Level 10 · Level ${playerLevel}`}
                                    </button>
                                </div>
                            </article>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};
