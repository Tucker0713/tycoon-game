import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';

export const CurrencyTicker: React.FC = () => {
    const { currency, productionPerSec, setCurrency } = useGameStore();

    // Client-side high-frequency smooth ticker (updates every 100ms)
    useEffect(() => {
        if (productionPerSec <= 0) return;

        const interval = setInterval(() => {
            const increment = (productionPerSec / 10); // 10 ticks per second
            setCurrency((prev) => prev + increment);
        }, 100);

        return () => clearInterval(interval);
    }, [productionPerSec, setCurrency]);

    return (
        <div className="bg-amber-900/40 border border-amber-600/50 p-6 rounded-xl shadow-lg text-center backdrop-blur-sm">
            <h2 className="text-amber-200 text-sm font-semibold uppercase tracking-wider">Village Gold / Resources</h2>
            <div className="text-4xl font-black text-amber-400 mt-2">
                🌾 {currency.toFixed(1)}
            </div>
            <p className="text-xs text-amber-300/70 mt-1">
                +{productionPerSec.toFixed(1)} / sec
            </p>
        </div>
    );
};