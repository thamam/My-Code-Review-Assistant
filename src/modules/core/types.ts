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
    cursorLine?: number;
}

export interface UserMessageEvent {
    type: 'USER_MESSAGE';
    payload: {
        content?: string;
        text?: string; // Alias for content (backwards compat)
        source?: 'voice' | 'text';
        mode?: 'voice' | 'text'; // Alias for source
        context?: UIContext;
        prData?: any; // PR Data snapshot
        timestamp?: number;
    };
}

export interface VoiceInputEvent {
    type: 'VOICE_INPUT';
    payload: {
        text: string;
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

// Phase 15.2: Human-in-the-Loop - User approval/rejection of pending action
export interface UserApprovalEvent {
    type: 'USER_APPROVAL';
    payload: {
        approved: boolean; // true = execute, false = reject
        timestamp?: number;
    };
}

// Phase 17: User Activity Tracking (FR-041/FR-042)
// Tracks user micro-actions to prevent Agent from stealing focus
export interface UserActivityEvent {
    type: 'USER_ACTIVITY';
    payload: {
        timestamp: number;
        action?: 'typing' | 'scrolling' | 'clicking';
    };
}

export type UserIntent = UserMessageEvent | UIInteractionEvent | CodeChangeEvent | UserApprovalEvent | UserActivityEvent | VoiceInputEvent;

// ============================================================================
// OUTPUT SIGNALS (AgentAction) - Agent -> UI
// ============================================================================

export interface AgentSpeakEvent {
    type: 'AGENT_SPEAK';
    payload: {
        messageId?: string;
        content?: string;
        text?: string; // Alias for content (backwards compat)
        isStreaming?: boolean;
        isFinal?: boolean;
        mode?: 'tts' | 'text' | 'both';
        priority?: 'high' | 'normal' | 'low';
        timestamp?: number;
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
        stage: 'started' | 'processing' | 'completed' | 'tool_error';
        message?: string;
        timestamp: number;
        error?: string; // Optional error detail
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

export interface AgentExecCmdEvent {
    type: 'AGENT_EXEC_CMD';
    payload: {
        command: string;
        args: string[];
        timestamp: number;
    };
}

export interface AgentPlanCreatedEvent {
    type: 'AGENT_PLAN_CREATED';
    payload: {
        plan: any; // AgentPlan from planner/types.ts
    };
}

// Phase 15: Human-in-the-Loop - Agent requests user approval for sensitive actions
export interface AgentRequestApprovalEvent {
    type: 'AGENT_REQUEST_APPROVAL';
    payload: {
        tool: string; // The tool requiring approval (e.g., 'run_terminal_command')
        args: Record<string, unknown>; // The arguments for the tool
    };
}

// Phase 16: The Memory Palace - Session Restoration
export interface AgentSessionRestoredEvent {
    type: 'AGENT_SESSION_RESTORED';
    payload: {
        state: any; // The restored AgentState
    };
}

// FR-041: Agent yields control to user
export interface AgentYieldEvent {
    type: 'AGENT_YIELD';
    payload: {
        reason: 'user_activity' | 'user_barge_in';
        timestamp: number;
    };
}

// FR-009: Agent entering self-correction mode
export interface RepairModeEvent {
    type: 'REPAIR_MODE';
    payload: {
        originalGoal: string;
        lastError: string;
        timestamp: number;
    };
}

export type AgentAction =
    | AgentSpeakEvent
    | AgentNavigateEvent
    | AgentThinkingEvent
    | AgentTabSwitchEvent
    | AgentDiffModeEvent
    | AgentExecCmdEvent
    | AgentPlanCreatedEvent
    | AgentRequestApprovalEvent
    | AgentSessionRestoredEvent
    | AgentYieldEvent
    | RepairModeEvent;

// ============================================================================
// SYSTEM EVENTS (Runtime / Infrastructure)
// ============================================================================

export interface RuntimeOutputEvent {
    type: 'RUNTIME_OUTPUT';
    payload: {
        stream: 'stdout' | 'stderr';
        data: string;
    };
}

export interface RuntimeReadyEvent {
    type: 'RUNTIME_READY';
    payload: {
        url: string;
    };
}

export interface RuntimeExitEvent {
    type: 'RUNTIME_EXIT';
    payload: {
        exitCode: number;
    };
}

export interface SystemFileSyncEvent {
    type: 'SYSTEM_FILE_SYNC';
    payload: {
        path: string;
        content: string;
    };
}

export interface SessionResetEvent {
    type: 'SESSION_RESET';
    payload: {
        reason: 'new_session' | 'user_reset';
        repoName?: string;
    };
}

export type SystemEvent = RuntimeOutputEvent | RuntimeReadyEvent | RuntimeExitEvent | SystemFileSyncEvent | SessionResetEvent;

// ============================================================================
// UNIFIED EVENT TYPE
// ============================================================================

export type TheiaEvent = UserIntent | AgentAction | SystemEvent;

// Type guard helpers
export function isUserIntent(event: TheiaEvent): event is UserIntent {
    return ['USER_MESSAGE', 'UI_INTERACTION', 'CODE_CHANGE', 'USER_APPROVAL', 'USER_ACTIVITY', 'VOICE_INPUT'].includes(event.type);
}

export function isAgentAction(event: TheiaEvent): event is AgentAction {
    return ['AGENT_SPEAK', 'AGENT_NAVIGATE', 'AGENT_THINKING', 'AGENT_TAB_SWITCH', 'AGENT_DIFF_MODE', 'AGENT_EXEC_CMD', 'AGENT_PLAN_CREATED', 'AGENT_REQUEST_APPROVAL', 'AGENT_SESSION_RESTORED', 'AGENT_YIELD', 'REPAIR_MODE'].includes(event.type);
}

export function isSystemEvent(event: TheiaEvent): event is SystemEvent {
    return ['RUNTIME_OUTPUT', 'RUNTIME_READY', 'RUNTIME_EXIT', 'SYSTEM_FILE_SYNC', 'SESSION_RESET'].includes(event.type);
}

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
// EVENT METADATA (for Black Box logging)
// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =

export interface EventEnvelope {
    id: string;
    event: TheiaEvent;
    timestamp: number;
    source: 'ui' | 'agent' | 'system';
}

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
// TRACEABILITY (Operation Glass Box)
// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =

export interface TraceEntry {
    envelope: EventEnvelope;
    state: any; // Snapshot of AgentState at the time of event
}

export interface FlightRecorder {
    record(entry: TraceEntry): Promise<void>;
    getEntries(): Promise<TraceEntry[]>;
    clear(): Promise<void>;
}
