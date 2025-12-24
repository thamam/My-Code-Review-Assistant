/**
 * SpecContext.tsx
 * 
 * The "Motherboard" of Phase 7: Spec-Driven Traceability
 * 
 * Glues together:
 * - Adapters (LinearAdapter, FileAdapter) - The Inputs
 * - AtomizerService - The Brain
 * - SpecDocument state - The Output
 * 
 * Provides a single source of truth for the active spec and its atoms.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { SpecDocument, SpecAtom } from '../src/types/SpecTypes';
import { atomize } from '../src/services/AtomizerService';
import { createLinearAdapter } from '../src/adapters/LinearAdapter';
import { pickAndReadSpecFile } from '../src/adapters/FileAdapter';

// --- Types ---

type SpecStatus = 'idle' | 'loading' | 'success' | 'error';

interface SpecContextType {
    /** The currently loaded SpecDocument (or null) */
    activeSpec: SpecDocument | null;

    /** Current loading/status state */
    status: SpecStatus;

    /** Error message (if status === 'error') */
    error: string | null;

    /** Load a spec from a Linear issue */
    loadSpecFromLinear: (issueId: string) => Promise<void>;

    /** Open file picker and load a spec from a local .md file */
    loadSpecFromFile: () => Promise<void>;

    /** Load a spec from raw content (manual/clipboard) */
    loadSpecFromContent: (content: string, title?: string) => Promise<void>;

    /** Clear the active spec */
    clearSpec: () => void;

    /** Update the status of a specific atom */
    updateAtomStatus: (atomId: string, status: SpecAtom['status'], reason?: string) => void;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

// --- Provider ---

export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeSpec, setActiveSpec] = useState<SpecDocument | null>(null);
    const [status, setStatus] = useState<SpecStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    /**
     * Load a spec from Linear issue.
     */
    const loadSpecFromLinear = useCallback(async (issueId: string) => {
        setStatus('loading');
        setError(null);

        try {
            const adapter = createLinearAdapter();
            if (!adapter) {
                throw new Error('Linear API key not configured');
            }

            const result = await adapter.fetch(issueId);
            if (!result) {
                throw new Error(`Failed to fetch Linear issue: ${issueId}`);
            }

            console.log('[SpecContext] Fetched from Linear:', result.title);

            // Atomize the content
            const atomized = await atomize({
                content: result.content,
                sourceId: issueId,
                sourceType: 'linear',
                title: result.title
            });

            if (!atomized.success || !atomized.spec) {
                // Fallback: Create spec with empty atoms if atomization fails
                console.warn('[SpecContext] Atomization failed, using raw content');
                setActiveSpec({
                    id: issueId,
                    source: 'linear',
                    title: result.title,
                    rawContent: result.content,
                    atoms: [],
                    atomizedAt: Date.now()
                });
            } else {
                setActiveSpec(atomized.spec);
            }

            setStatus('success');

        } catch (e: any) {
            console.error('[SpecContext] loadSpecFromLinear error:', e);
            setError(e.message || 'Failed to load spec from Linear');
            setStatus('error');
        }
    }, []);

    /**
     * Open file picker and load a spec from local .md file.
     */
    const loadSpecFromFile = useCallback(async () => {
        setStatus('loading');
        setError(null);

        try {
            const result = await pickAndReadSpecFile();
            if (!result) {
                // User cancelled - reset to idle without error
                setStatus(activeSpec ? 'success' : 'idle');
                return;
            }

            console.log('[SpecContext] Read file:', result.fileName);

            // Atomize the content
            const atomized = await atomize({
                content: result.content,
                sourceId: `file://${result.fileName}`,
                sourceType: 'markdown_file',
                title: result.title
            });

            if (!atomized.success || !atomized.spec) {
                // Fallback: Create spec with empty atoms if atomization fails
                console.warn('[SpecContext] Atomization failed, using raw content');
                setActiveSpec({
                    id: `file://${result.fileName}`,
                    source: 'markdown_file',
                    title: result.title,
                    rawContent: result.content,
                    atoms: [],
                    atomizedAt: Date.now()
                });
            } else {
                setActiveSpec(atomized.spec);
            }

            setStatus('success');

        } catch (e: any) {
            console.error('[SpecContext] loadSpecFromFile error:', e);
            setError(e.message || 'Failed to load spec from file');
            setStatus('error');
        }
    }, [activeSpec]);

    /**
     * Load a spec from raw content (manual paste / clipboard).
     */
    const loadSpecFromContent = useCallback(async (content: string, title?: string) => {
        setStatus('loading');
        setError(null);

        try {
            const sourceId = `manual-${Date.now()}`;

            const atomized = await atomize({
                content,
                sourceId,
                sourceType: 'manual',
                title
            });

            if (!atomized.success || !atomized.spec) {
                // Fallback: Create spec with empty atoms if atomization fails
                console.warn('[SpecContext] Atomization failed, using raw content');
                setActiveSpec({
                    id: sourceId,
                    source: 'manual',
                    title: title || 'Manual Spec',
                    rawContent: content,
                    atoms: [],
                    atomizedAt: Date.now()
                });
            } else {
                setActiveSpec(atomized.spec);
            }

            setStatus('success');

        } catch (e: any) {
            console.error('[SpecContext] loadSpecFromContent error:', e);
            setError(e.message || 'Failed to load spec from content');
            setStatus('error');
        }
    }, []);

    /**
     * Clear the active spec.
     */
    const clearSpec = useCallback(() => {
        setActiveSpec(null);
        setStatus('idle');
        setError(null);
    }, []);

    /**
     * Update the status of a specific atom.
     */
    const updateAtomStatus = useCallback((atomId: string, newStatus: SpecAtom['status'], reason?: string) => {
        setActiveSpec(prev => {
            if (!prev) return prev;

            return {
                ...prev,
                atoms: prev.atoms.map(atom =>
                    atom.id === atomId
                        ? { ...atom, status: newStatus, statusReason: reason }
                        : atom
                )
            };
        });
    }, []);

    return (
        <SpecContext.Provider value={{
            activeSpec,
            status,
            error,
            loadSpecFromLinear,
            loadSpecFromFile,
            loadSpecFromContent,
            clearSpec,
            updateAtomStatus
        }}>
            {children}
        </SpecContext.Provider>
    );
};

// --- Hook ---

export const useSpec = () => {
    const context = useContext(SpecContext);
    if (context === undefined) {
        throw new Error('useSpec must be used within a SpecProvider');
    }
    return context;
};
