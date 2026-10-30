import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { CurrencyTicker } from './CurrencyTicker';
import { Hammer, Trees, Pickaxe, Citrus, Sparkles } from 'lucide-react';

export const VillageDashboard: React.FC = () => {
    const { currency, ownedNodes, offlineEarned, fetchGameState, buyNode, gather, dismissOfflineEarned } =
        useGameStore();

    useEffect(() => {
        fetchGameState();
        // Re-sync with the server every 30s so client-side ticking can't drift far.
        const id = setInterval(fetchGameState, 30000);
        return () => clearInterval(id);
    }, [fetchGameState]);

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
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center">
            <header className="mb-6 text-center">
                <h1 className="text-4xl font-extrabold text-amber-500 tracking-tight flex items-center justify-center gap-2">
                    🏰 Village Simulator
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    Expand your settlement and boost resource production
                </p>
            </header>

            {offlineEarned > 0.05 && (
                <div className="w-full max-w-md mb-4 p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-emerald-300 text-sm flex justify-between items-center">
                    <span>Welcome back! Your village earned 🌾 {offlineEarned.toFixed(1)} while you were away.</span>
                    <button onClick={dismissOfflineEarned} className="text-xs underline cursor-pointer">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="w-full max-w-md mb-6">
                <CurrencyTicker />
            </div>

            <button
                onClick={gather}
                className="mb-8 px-8 py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-lg rounded-xl shadow-lg transition duration-150 flex items-center gap-2 cursor-pointer"
            >
                <Sparkles className="w-6 h-6" />
                Gather Resources (+1 Gold)
            </button>

            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ownedNodes.map((item) => {
                    const canAfford = currency >= item.current_cost;

                    return (
                        <div
                            key={item.id}
                            className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-md hover:border-amber-500/50 transition duration-200 flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-slate-700/50 rounded-lg">
                                        {getIcon(item.node.icon)}
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider bg-slate-700 px-3 py-1 rounded-full text-slate-300">
                                        Lvl {item.level}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-slate-100">{item.node.name}</h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    Yield: +{item.yield_per_sec.toFixed(1)} / sec
                                    {item.level === 0 && ` (${item.node.base_yield} per level)`}
                                </p>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={() => buyNode(item.node.id)}
                                    disabled={!canAfford}
                                    className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
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