import React from 'react';
import { Hammer, Trees, Pickaxe, Citrus } from 'lucide-react';

export interface Pickup {
    id: number;
    x: number;               // percent from left
    y: number;               // percent from top
    nodeId: number | null;   // null = a coin, otherwise the producer it came from
    icon: string;            // 'coin' or the producer's icon name
    label: string;           // for the tooltip
}

export const MAX_PICKUPS = 150;  // total items allowed in the box
export const MAX_PER_NODE = 25;  // resource items allowed per producer

const COLORS: Record<string, string> = {
    coin: 'from-amber-300 to-amber-500 border-amber-600',
    apple: 'from-red-400 to-red-600 border-red-700',
    citrus: 'from-red-400 to-red-600 border-red-700',
    tree: 'from-emerald-400 to-emerald-600 border-emerald-700',
    mountain: 'from-slate-300 to-slate-500 border-slate-600',
    hammer: 'from-orange-400 to-orange-600 border-orange-700',
};

const renderIcon = (icon: string) => {
    switch (icon) {
        case 'coin':
            return <span className="text-xl leading-none">🌾</span>;
        case 'apple':
        case 'citrus':
            return <Citrus className="w-6 h-6 text-white" />;
        case 'tree':
            return <Trees className="w-6 h-6 text-white" />;
        case 'mountain':
            return <Pickaxe className="w-6 h-6 text-white" />;
        default:
            return <Hammer className="w-6 h-6 text-white" />;
    }
};

interface CoinFieldProps {
    pickups: Pickup[];
    onCollect: (pickup: Pickup) => void;
}

export const CoinField: React.FC<CoinFieldProps> = ({ pickups, onCollect }) => (
    <div className="relative w-full h-96 lg:h-[min(70vh,48rem)] lg:min-h-[28rem] rounded-2xl border border-slate-700/60 bg-slate-950/60 overflow-hidden select-none">
        <style>{`
            @keyframes coinPop {
                from { transform: scale(0) rotate(-90deg); opacity: 0; }
                to   { transform: scale(1) rotate(0deg);   opacity: 1; }
            }
        `}</style>

        {pickups.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-600">
                Press Spawn Coins to add coins. Buy producers and their resources will appear here too.
            </p>
        )}

        {pickups.map((p) => (
            // Outer div handles position; inner button handles the pop-in animation.
            <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
                <button
                    onClick={() => onCollect(p)}
                    aria-label={`Collect ${p.label}`}
                    title={p.label}
                    className={`w-12 h-12 rounded-full bg-gradient-to-br ${
                        COLORS[p.icon] ?? COLORS.hammer
                    } border-4 shadow-lg flex items-center justify-center hover:scale-110 active:scale-90 transition-transform duration-100 cursor-pointer`}
                    style={{ animation: 'coinPop 0.25s ease-out' }}
                >
                    {renderIcon(p.icon)}
                </button>
            </div>
        ))}
    </div>
);
