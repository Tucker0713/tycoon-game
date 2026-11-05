import React from 'react';
import { useGameStore } from '../store/useGameStore';

export const Market: React.FC = () => {
    const { ownedNodes, sellNode, sellAll } = useGameStore();

    const producers = ownedNodes.filter((n) => n.level > 0);
    const totalValue = producers.reduce((sum, n) => sum + n.stock * n.sell_price, 0);

    return (
        <div className="w-full max-w-md mb-8 bg-slate-800/80 border border-slate-700 rounded-xl p-4 shadow-md">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-100">🏪 Market</h2>
                <button
                    onClick={sellAll}
                    disabled={totalValue < 0.01}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                        totalValue >= 0.01
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95'
                            : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                >
                    Sell All (+{totalValue.toFixed(1)})
                </button>
            </div>

            {producers.length === 0 ? (
                <p className="text-xs text-slate-400">
                    Buy a producer to start collecting resources you can sell here.
                </p>
            ) : (
                <ul className="space-y-2">
                    {producers.map((n) => {
                        const value = n.stock * n.sell_price;
                        const canSell = value >= 0.01;
                        return (
                            <li
                                key={n.id}
                                className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-lg px-3 py-2"
                            >
                                <div>
                                    <div className="text-sm font-semibold text-slate-100">
                                        {n.resource_label}: {n.stock.toFixed(1)}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                        🌾 {n.sell_price} each
                                    </div>
                                </div>
                                <button
                                    onClick={() => sellNode(n.node.id)}
                                    disabled={!canSell}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                                        canSell
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer active:scale-95'
                                            : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    Sell (+{value.toFixed(1)})
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
