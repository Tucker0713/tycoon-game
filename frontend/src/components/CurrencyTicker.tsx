import React from 'react';
import { useGameStore } from '../store/useGameStore';

export const CurrencyTicker: React.FC = () => {
    const currency = useGameStore((s) => s.currency);

    return (
        <div className="bg-amber-900/40 border border-amber-600/50 p-3 rounded-xl shadow-lg text-center backdrop-blur-sm">
            <h2 className="text-amber-200 text-xs font-semibold uppercase tracking-wider">Gold</h2>
            <div className="text-2xl font-black text-amber-400 mt-1">
                🪙 {currency.toFixed(1)}
            </div>
            <p className="text-xs text-amber-300/70 mt-1">Sell resources to earn gold</p>
        </div>
    );
};
