
import { eventBus } from "./EventBus";
import { FlightRecorder, TraceEntry, EventEnvelope } from "./types";
import { TheiaAgent } from "./Agent";

/**
 * TraceService
 * 
 * The "Black Box" Observer.
 * Subscribes to all events on the EventBus and correlates them with the Agent's internal state.
 */
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
            
            // Create a snapshot (shallow copy for basic safety)
            const stateSnapshot = state ? { ...state } : null;

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
}
