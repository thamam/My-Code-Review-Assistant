/**
 * src/modules/persistence/StorageService.ts
 * The Vault: Persistence Layer for Agent State.
 * Phase 16: The Memory Palace.
 * 
 * Handles serialization/deserialization of AgentState to/from localStorage.
 * The Agent's messages are already plain objects { role, content }, so no
 * LangChain message hydration is needed.
 */

import { AgentState } from "../core/Agent";

const STORAGE_KEY = 'THEIA_AGENT_STATE_V1';

class StorageService {

    /**
     * Freeze the Agent's state to localStorage.
     * Saves: messages, context, prData, plan, pendingAction.
     */
    public saveState(state: AgentState) {
        try {
            if (!state) return;

            // AgentState messages are already { role, content } - no dehydration needed
            const serializedState = {
                messages: state.messages,
                context: state.context,
                prData: state.prData,
                plan: state.plan,
                pendingAction: state.pendingAction,
                lastError: state.lastError,
                savedAt: Date.now() // Timestamp for debugging
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedState));
            console.log('[Storage] State saved.');
        } catch (err) {
            console.error('[Storage] Failed to save state:', err);
        }
    }

    /**
     * Thaw the Agent's state from localStorage.
     * Returns partial state that can be merged with fresh context.
     */
    public loadState(): Partial<AgentState> | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;

            const parsed = JSON.parse(raw);

            console.log(`[Storage] State loaded. Saved at: ${new Date(parsed.savedAt).toISOString()}`);

            return {
                messages: parsed.messages || [],
                context: parsed.context,
                prData: parsed.prData,
                plan: parsed.plan,
                pendingAction: parsed.pendingAction,
                lastError: parsed.lastError
            };
        } catch (err) {
            console.error('[Storage] Failed to load state:', err);
            return null;
        }
    }

    /**
     * Clear the Agent's persisted state.
     * Use when starting a fresh session or on user command.
     */
    public clearState() {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[Storage] State cleared.');
    }

    /**
     * Check if there's a saved state available.
     */
    public hasSavedState(): boolean {
        return localStorage.getItem(STORAGE_KEY) !== null;
    }
}

export const storageService = new StorageService();
