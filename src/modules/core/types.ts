/**
 * src/modules/core/types.ts
 * Protocol Definition for Event-Driven Architecture.
 * Defines the contract between UI (Signals) and Agent (Actions).
 */

// ============================================================================
// INPUT SIGNALS (UserIntent) - UI -> Agent
// ============================================================================

export interface UserMessageEvent {
    type: 'USER_MESSAGE';
    payload: {
        content: string;
        source: 'voice' | 'text';
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
        content: string;
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

export type AgentAction = AgentSpeakEvent | AgentNavigateEvent | AgentThinkingEvent;

// ============================================================================
// UNIFIED EVENT TYPE
// ============================================================================

export type TheiaEvent = UserIntent | AgentAction;

// Type guard helpers
export function isUserIntent(event: TheiaEvent): event is UserIntent {
    return ['USER_MESSAGE', 'UI_INTERACTION', 'CODE_CHANGE'].includes(event.type);
}

export function isAgentAction(event: TheiaEvent): event is AgentAction {
    return ['AGENT_SPEAK', 'AGENT_NAVIGATE', 'AGENT_THINKING'].includes(event.type);
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
