import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { CurrencyTicker } from './CurrencyTicker';
import { Market } from './Market';
import { Hammer, Trees, Pickaxe, Citrus, Sparkles } from 'lucide-react';

export const VillageDashboard: React.FC = () => {
    const { currency, ownedNodes, offlineEarned, fetchGameState, buyNode, gather, tickStocks, dismissOfflineEarned } =
        useGameStore();

    useEffect(() => {
        fetchGameState();
        // Re-sync with the server every 30s so client-side ticking can't drift far.
        const id = setInterval(fetchGameState, 30000);
        return () => clearInterval(id);
    }, [fetchGameState]);

    // Grow resource stockpiles smoothly between syncs (5 ticks per second).
    useEffect(() => {
        const id = setInterval(() => tickStocks(0.2), 200);
        return () => clearInterval(id);
    }, [tickStocks]);

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
                        {offlineEarned.map((e) => `${e.amount.toFixed(1)} ${e.resource}`).join(', ')}.
                    </span>
                    <button onClick={dismissOfflineEarned} className="text-xs underline cursor-pointer shrink-0">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="fixed top-14 right-4 z-40 w-56">
                <CurrencyTicker />
            </div>

            <button
                onClick={gather}
                className="mb-8 px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-lg rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
            >
                <Sparkles className="w-6 h-6" />
                Gather Resources (+1 Gold)
            </button>

            <Market />

            <div className="w-full max-w-md mx-auto grid grid-cols-2 gap-4 z-30 lg:mx-0 lg:absolute lg:left-4 lg:top-32 lg:w-[30rem]">
                {ownedNodes.map((item) => {
                    const canAfford = currency >= item.current_cost;

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
                                        Lvl {item.level}
                                    </span>
                                </div>

                                <h3 className="text-base font-bold text-slate-100">{item.node.name}</h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    Makes +{item.yield_per_sec.toFixed(1)} {item.resource_label.toLowerCase()} / sec
                                    {item.level === 0 && ` (${item.node.base_yield} per level)`}
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
                                    <span>{item.level === 0 ? 'Buy' : 'Upgrade'}</span>
                                    <span className="text-xs opacity-90">
                                        (🌾 {item.current_cost.toFixed(1)})
                                    </span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
