/**
 * SpecPanel.tsx
 * 
 * Main panel component for the "Specs" sidebar tab.
 * Displays the active SpecDocument and its atomic requirements.
 * Part of Phase 7: Spec-Driven Traceability UI
 */

import React from 'react';
import { useSpec } from '../../contexts/SpecContext';
import { AtomItem } from './AtomItem';
import { FileUp, Link, Loader2, AlertCircle, FileText, X, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface SpecPanelProps {
    onLinkLinear?: () => void;
}

/** Check if Linear API key is configured */
const hasLinearAPIKey = () => {
    return !!(import.meta.env.VITE_LINEAR_API_KEY || localStorage.getItem('vcr_linear_key'));
};

export const SpecPanel: React.FC<SpecPanelProps> = ({ onLinkLinear }) => {
    const {
        activeSpec,
        status,
        error,
        loadSpecFromFile,
        clearSpec
    } = useSpec();

    // Loading State
    if (status === 'loading') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-900">
                <Loader2 size={32} className="text-amber-400 animate-spin mb-4" />
                <p className="text-sm text-gray-400">Loading spec...</p>
            </div>
        );
    }

    // Error State
    if (status === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-900">
                <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle size={24} className="text-red-400" />
                </div>
                <h3 className="text-sm font-medium text-red-300 mb-2">Failed to Load Spec</h3>
                <p className="text-xs text-gray-500 max-w-[200px] mb-4">{error}</p>
                <button
                    onClick={loadSpecFromFile}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors"
                >
                    <RefreshCw size={12} className="inline mr-1" />
                    Try Again
                </button>
            </div>
        );
    }

    // Empty State (no spec loaded)
    if (!activeSpec) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 bg-gray-900">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <FileText size={24} className="opacity-50" />
                </div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">No Spec Loaded</h3>
                <p className="text-xs mb-6 max-w-[200px]">
                    Load a specification to see atomized requirements and track compliance.
                </p>

                <div className="flex flex-col gap-2 w-full max-w-[180px]">
                    <button
                        onClick={loadSpecFromFile}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wide rounded transition-colors"
                        data-testid="load-spec-file-btn"
                    >
                        <FileUp size={14} />
                        Load File
                    </button>

                    {hasLinearAPIKey() && onLinkLinear && (
                        <button
                            onClick={onLinkLinear}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded transition-colors border border-gray-700"
                            data-testid="load-spec-linear-btn"
                        >
                            <Link size={12} />
                            Load from Linear
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Loaded State
    return (
        <div className="h-full bg-gray-900 flex flex-col font-sans">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 bg-gray-900 shrink-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className="text-sm font-bold text-gray-100 leading-snug line-clamp-2">
                        {activeSpec.title}
                    </h2>
                    <button
                        onClick={clearSpec}
                        className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors shrink-0"
                        title="Clear spec"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500 truncate">
                        {activeSpec.id}
                    </span>
                    <span className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full border uppercase font-medium",
                        activeSpec.source === 'linear' && "bg-blue-900/50 text-blue-300 border-blue-800",
                        activeSpec.source === 'markdown_file' && "bg-amber-900/50 text-amber-300 border-amber-800",
                        activeSpec.source === 'manual' && "bg-gray-800 text-gray-400 border-gray-700"
                    )}>
                        {activeSpec.source === 'markdown_file' ? 'File' : activeSpec.source}
                    </span>
                </div>

                {/* Atom Count Summary */}
                <div className="mt-3 pt-3 border-t border-gray-800">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Requirements</span>
                        <span className="text-gray-300 font-medium">
                            {activeSpec.atoms.length} atoms
                        </span>
                    </div>

                    {/* Status Summary */}
                    {activeSpec.atoms.length > 0 && (
                        <div className="flex items-center gap-3 mt-2 text-[10px]">
                            <span className="text-gray-500">
                                ⏳ {activeSpec.atoms.filter(a => a.status === 'pending').length}
                            </span>
                            <span className="text-green-400">
                                ✓ {activeSpec.atoms.filter(a => a.status === 'verified').length}
                            </span>
                            <span className="text-red-400">
                                ✗ {activeSpec.atoms.filter(a => a.status === 'violated').length}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Atoms List */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                {activeSpec.atoms.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <p className="text-xs">No atoms extracted.</p>
                        <p className="text-[10px] mt-1 text-gray-600">
                            The spec may not contain structured requirements.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {activeSpec.atoms.map(atom => (
                            <AtomItem
                                key={atom.id}
                                atom={atom}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
