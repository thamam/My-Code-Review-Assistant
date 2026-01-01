/**
 * src/modules/core/types.ts
 * Protocol Definition for Event-Driven Architecture.
 * Defines the contract between UI (Signals) and Agent (Actions).
 */

// ============================================================================
// INPUT SIGNALS (UserIntent) - UI -> Agent
// ============================================================================

// UI Context passed with messages (what the user currently sees)
export interface UIContext {
    activeTab: 'files' | 'annotations' | 'issue' | 'diagrams';
    activeFile: string | null;
    activeSelection: string | null;
    activeDiagram: string | null;
    prData?: {
        title: string;
        author: string;
        description: string;
        files: Array<{ path: string; status: string; newContent?: string }>;
    };
    linearIssue?: {
        identifier: string;
        title: string;
        description: string;
    };
    diagrams?: Array<{ id: string; title: string }>;
}

export interface UserMessageEvent {
    type: 'USER_MESSAGE';
    payload: {
        content: string;
        source: 'voice' | 'text';
        context?: UIContext;
        timestamp: number;
    };
}

export interface UIInteractionEvent {
    type: 'UI_INTERACTION';
    payload: {
        action: 'file_select' | 'line_click' | 'diagram_click' | 'toggle' | 'scroll';
        target: string;
        metadata?: Record<string, unknown>;
        timestamp: number;
    };
}

export interface CodeChangeEvent {
    type: 'CODE_CHANGE';
    payload: {
        file: string;
        line: number;
        changeType: 'selection' | 'navigation' | 'annotation';
        content?: string;
        timestamp: number;
    };
}

export type UserIntent = UserMessageEvent | UIInteractionEvent | CodeChangeEvent;

// ============================================================================
// OUTPUT SIGNALS (AgentAction) - Agent -> UI
// ============================================================================

export interface AgentSpeakEvent {
    type: 'AGENT_SPEAK';
    payload: {
        messageId: string;
        content: string;
        isStreaming: boolean;
        isFinal: boolean;
        mode: 'tts' | 'text' | 'both';
        priority: 'high' | 'normal' | 'low';
        timestamp: number;
    };
}

export interface AgentNavigateEvent {
    type: 'AGENT_NAVIGATE';
    payload: {
        target: {
            file: string;
            line: number;
        };
        reason: string;
        highlight?: boolean;
        timestamp: number;
    };
}

export interface AgentThinkingEvent {
    type: 'AGENT_THINKING';
    payload: {
        stage: 'started' | 'processing' | 'completed';
        message?: string;
        timestamp: number;
    };
}

export interface AgentTabSwitchEvent {
    type: 'AGENT_TAB_SWITCH';
    payload: {
        tab: 'files' | 'annotations' | 'issue' | 'diagrams';
        timestamp: number;
    };
}

export interface AgentDiffModeEvent {
    type: 'AGENT_DIFF_MODE';
    payload: {
        enable: boolean;
        timestamp: number;
    };
}

export type AgentAction =
    | AgentSpeakEvent
    | AgentNavigateEvent
    | AgentThinkingEvent
    | AgentTabSwitchEvent
    | AgentDiffModeEvent;

// ============================================================================
// UNIFIED EVENT TYPE
// ============================================================================

export type TheiaEvent = UserIntent | AgentAction;

// Type guard helpers
export function isUserIntent(event: TheiaEvent): event is UserIntent {
    return ['USER_MESSAGE', 'UI_INTERACTION', 'CODE_CHANGE'].includes(event.type);
}

export function isAgentAction(event: TheiaEvent): event is AgentAction {
    return ['AGENT_SPEAK', 'AGENT_NAVIGATE', 'AGENT_THINKING', 'AGENT_TAB_SWITCH', 'AGENT_DIFF_MODE'].includes(event.type);
}

// ============================================================================
// EVENT METADATA (for Black Box logging)
// ============================================================================

export interface EventEnvelope {
    id: string;
    event: TheiaEvent;
    timestamp: number;
    source: 'ui' | 'agent' | 'system';
}
