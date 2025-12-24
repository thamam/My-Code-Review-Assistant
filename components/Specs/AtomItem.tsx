/**
 * AtomItem.tsx
 * 
 * Sub-component for rendering individual SpecAtom requirements.
 * Part of Phase 7: Spec-Driven Traceability UI
 */

import React, { useState } from 'react';
import { SpecAtom } from '../../src/types/SpecTypes';
import { Circle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import clsx from 'clsx';

interface AtomItemProps {
    atom: SpecAtom;
    onClick?: () => void;
}

/** Category badge styles */
const CATEGORY_STYLES: Record<SpecAtom['category'], string> = {
    logic: 'bg-blue-900/50 text-blue-300 border-blue-700',
    ui: 'bg-purple-900/50 text-purple-300 border-purple-700',
    security: 'bg-red-900/50 text-red-300 border-red-700',
    schema: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    performance: 'bg-green-900/50 text-green-300 border-green-700',
    other: 'bg-gray-800 text-gray-400 border-gray-700',
};

/** Status icons */
const STATUS_ICONS: Record<SpecAtom['status'], { icon: typeof Circle; color: string }> = {
    pending: { icon: Circle, color: 'text-gray-500' },
    verified: { icon: CheckCircle, color: 'text-green-400' },
    violated: { icon: XCircle, color: 'text-red-400' },
    not_applicable: { icon: MinusCircle, color: 'text-gray-600' },
};

export const AtomItem: React.FC<AtomItemProps> = ({ atom, onClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const StatusIcon = STATUS_ICONS[atom.status].icon;
    const statusColor = STATUS_ICONS[atom.status].color;
    const categoryStyle = CATEGORY_STYLES[atom.category] || CATEGORY_STYLES.other;

    const handleClick = () => {
        setIsExpanded(!isExpanded);
        onClick?.();
    };

    return (
        <div
            className={clsx(
                "p-3 border border-gray-800 rounded-lg transition-all cursor-pointer",
                "hover:border-gray-700 hover:bg-gray-800/30",
                isExpanded && "border-amber-700/50 bg-gray-800/50"
            )}
            onClick={handleClick}
            data-testid={`atom-item-${atom.id}`}
        >
            {/* Header Row */}
            <div className="flex items-start gap-2">
                {/* Status Icon */}
                <StatusIcon size={16} className={clsx(statusColor, "shrink-0 mt-0.5")} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* ID + Category */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">{atom.id}</span>
                        <span className={clsx(
                            "text-[10px] px-1.5 py-0.5 rounded border uppercase font-medium",
                            categoryStyle
                        )}>
                            {atom.category}
                        </span>
                    </div>

                    {/* Description */}
                    <p className={clsx(
                        "text-xs text-gray-300 leading-relaxed",
                        !isExpanded && "line-clamp-2"
                    )}>
                        {atom.description}
                    </p>

                    {/* Expanded Details */}
                    {isExpanded && atom.statusReason && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                            <span className="text-[10px] text-gray-500 uppercase">Reason:</span>
                            <p className="text-xs text-gray-400 mt-0.5">{atom.statusReason}</p>
                        </div>
                    )}

                    {isExpanded && atom.context.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                            <span className="text-[10px] text-gray-500 uppercase">Context:</span>
                            <ul className="mt-1 space-y-0.5">
                                {atom.context.map((ctx, i) => (
                                    <li key={i} className="text-xs font-mono text-amber-400/80 truncate">
                                        {ctx}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
