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
import type { VerificationState } from "../../types/review";
import type { Note, Diagram, ChatMessage } from "../../../types";

const STORAGE_KEY = 'THEIA_AGENT_STATE_V1';
const REVIEW_STATE_PREFIX = 'THEIA_REVIEW_STATE_V1_';
const DIAGRAMS_PREFIX = 'THEIA_DIAGRAMS_V1_';
const CHAT_PREFIX = 'THEIA_CHAT_V1_';

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

    // ─── F4: Review State Persistence ─────────────────────────────────────────

    /**
     * Save per-file verification states for a specific PR.
     */
    public saveReviewState(prId: string, states: Map<string, VerificationState>) {
        try {
            localStorage.setItem(
                `${REVIEW_STATE_PREFIX}${prId}`,
                JSON.stringify({ states: Object.fromEntries(states), savedAt: Date.now() })
            );
        } catch (err) {
            console.error('[Storage] Failed to save review state:', err);
        }
    }

    /**
     * Load per-file verification states for a specific PR.
     * Returns an empty Map if nothing is saved.
     */
    public loadReviewState(prId: string): Map<string, VerificationState> {
        try {
            const raw = localStorage.getItem(`${REVIEW_STATE_PREFIX}${prId}`);
            if (!raw) return new Map();
            const parsed = JSON.parse(raw);
            return new Map(Object.entries(parsed.states ?? {})) as Map<string, VerificationState>;
        } catch (err) {
            console.error('[Storage] Failed to load review state:', err);
            return new Map();
        }
    }

    // ─── Diagrams Persistence ─────────────────────────────────────────────────

    /**
     * Save generated diagrams for a specific PR.
     * Diagrams carry mermaid code + references; persisted as-is (plain JSON).
     */
    public saveDiagrams(prId: string, diagrams: Diagram[]) {
        try {
            localStorage.setItem(
                `${DIAGRAMS_PREFIX}${prId}`,
                JSON.stringify({ diagrams, savedAt: Date.now() })
            );
        } catch (err) {
            console.error('[Storage] Failed to save diagrams:', err);
        }
    }

    /**
     * Load saved diagrams for a specific PR.
     * Returns an empty array if nothing is saved.
     */
    public loadDiagrams(prId: string): Diagram[] {
        try {
            const raw = localStorage.getItem(`${DIAGRAMS_PREFIX}${prId}`);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return (parsed.diagrams ?? []) as Diagram[];
        } catch (err) {
            console.error('[Storage] Failed to load diagrams:', err);
            return [];
        }
    }

    // ─── Chat History Persistence ─────────────────────────────────────────────

    /**
     * Save the UI chat history (message list) for a specific PR.
     * Messages may carry groundingChunks and dual-track content; persisted as-is.
     */
    public saveChatHistory(prId: string, messages: ChatMessage[]) {
        try {
            localStorage.setItem(
                `${CHAT_PREFIX}${prId}`,
                JSON.stringify({ messages, savedAt: Date.now() })
            );
        } catch (err) {
            console.error('[Storage] Failed to save chat history:', err);
        }
    }

    /**
     * Load the UI chat history for a specific PR.
     * Returns null if nothing is saved (caller decides whether to seed welcome message).
     */
    public loadChatHistory(prId: string): ChatMessage[] | null {
        try {
            const raw = localStorage.getItem(`${CHAT_PREFIX}${prId}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return (parsed.messages ?? null) as ChatMessage[] | null;
        } catch (err) {
            console.error('[Storage] Failed to load chat history:', err);
            return null;
        }
    }

    // ─── F5: Whiteboard Notes Persistence ─────────────────────────────────────

    private readonly NOTES_PREFIX = 'THEIA_NOTES_V1_';

    /** Save whiteboard notes for a specific PR. */
    public saveNotes(prId: string, notes: Note[]): void {
        try {
            localStorage.setItem(`${this.NOTES_PREFIX}${prId}`, JSON.stringify(notes));
        } catch (err) {
            console.error('[Storage] Failed to save notes:', err);
        }
    }

    /** Load whiteboard notes for a specific PR. Returns empty array if nothing saved. */
    public loadNotes(prId: string): Note[] {
        try {
            const raw = localStorage.getItem(`${this.NOTES_PREFIX}${prId}`);
            if (!raw) return [];
            return JSON.parse(raw) as Note[];
        } catch (err) {
            console.error('[Storage] Failed to load notes:', err);
            return [];
        }
    }
}

export const storageService = new StorageService();
