
import { eventBus } from "./EventBus";
import { FlightRecorder, TraceEntry, EventEnvelope } from "./types";
import { TheiaAgent, AgentState } from "./Agent";

/**
 * TraceService
 *
 * The "Black Box" Observer.
 * Subscribes to all events on the EventBus and correlates them with the Agent's internal state.
 */

/**
 * Bounded projection of AgentState persisted per trace entry. Deliberately excludes
 * `prData` (full PR payload) and `context.activeFileContent` (up to 100k chars) —
 * embedding those verbatim is what made every FlightRecorder write megabytes wide.
 */
export interface TraceStateProjection {
    messageCount: number;
    planStatus?: string;
    planActiveStepIndex?: number;
    pendingAction?: string;
    activeFile: string | null;
    lastError?: string;
}

export class TraceService {
    private agent: TheiaAgent;
    private recorder: FlightRecorder;

    constructor(agent: TheiaAgent, recorder: FlightRecorder) {
        this.agent = agent;
        this.recorder = recorder;

        // Subscribe to ALL events
        eventBus.subscribe('*', (envelope: EventEnvelope) => {
            this.handleEvent(envelope);
        });

        console.log('[TraceService] Initialized and observing all signals.');
    }

    /**
     * Captures the event and the current state delta.
     * Executes in the next tick to remain non-blocking.
     */
    private handleEvent(envelope: EventEnvelope) {
        // We use setImmediate/setTimeout to ensure this doesn't block the main EventBus emit loop
        setTimeout(async () => {
            const state = this.agent.getState();

            // Bounded projection — never embed the raw state (see TraceStateProjection above)
            const stateSnapshot = state ? this.projectState(state) : null;

            const entry: TraceEntry = {
                envelope,
                state: stateSnapshot
            };

            try {
                await this.recorder.record(entry);
            } catch (err) {
                console.error('[TraceService] Failed to record trace:', err);
            }
        }, 0);
    }

    private projectState(state: AgentState): TraceStateProjection {
        return {
            messageCount: state.messages?.length ?? 0,
            planStatus: state.plan?.status,
            planActiveStepIndex: state.plan?.activeStepIndex,
            pendingAction: state.pendingAction?.tool,
            activeFile: state.context?.activeFile ?? null,
            // Defensively bounded even though callers currently keep this short (see Agent.ts lastError usages)
            lastError: state.lastError ? state.lastError.substring(0, 500) : undefined,
        };
    }
}
