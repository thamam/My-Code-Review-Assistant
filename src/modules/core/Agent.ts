/**
 * src/modules/core/Agent.ts
 * TheiaAgent: The Brain's interface to the Event-Driven Architecture.
 * Subscribes to UserIntent events and emits AgentAction responses.
 *
 * Phase 1: Placeholder implementation (logging + AGENT_THINKING emit).
 * Phase 2: Will integrate LangGraph for actual reasoning.
 */

import { eventBus } from './EventBus';
import {
    EventEnvelope,
    UserMessageEvent,
    AgentThinkingEvent,
    isUserIntent
} from './types';

class TheiaAgent {
    private isProcessing = false;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        console.log('[TheiaAgent] Initializing... Subscribing to EventBus.');

        // Subscribe to all UserIntent events
        eventBus.subscribe(
            ['USER_MESSAGE', 'UI_INTERACTION', 'CODE_CHANGE'],
            this.handleUserIntent.bind(this)
        );

        console.log('[TheiaAgent] Ready. Listening for UserIntent signals.');
    }

    // --- Event Handlers ---

    private handleUserIntent(envelope: EventEnvelope): void {
        const { event } = envelope;

        if (!isUserIntent(event)) return;

        switch (event.type) {
            case 'USER_MESSAGE':
                this.handleUserMessage(event, envelope);
                break;

            case 'UI_INTERACTION':
                console.log('[TheiaAgent] UI_INTERACTION received:', event.payload);
                // Phase 2: Will trigger context-aware responses
                break;

            case 'CODE_CHANGE':
                console.log('[TheiaAgent] CODE_CHANGE received:', event.payload);
                // Phase 2: Will trigger code analysis
                break;
        }
    }

    private handleUserMessage(event: UserMessageEvent, envelope: EventEnvelope): void {
        const { content, source } = event.payload;

        console.log(`[TheiaAgent] USER_MESSAGE received via ${source}:`, content);

        // Prevent concurrent processing
        if (this.isProcessing) {
            console.warn('[TheiaAgent] Already processing. Ignoring duplicate message.');
            return;
        }

        this.isProcessing = true;

        // Emit AGENT_THINKING (started)
        this.emitThinking('started', 'Processing your request...');

        // Placeholder: Simulate processing delay
        // Phase 2: This will invoke LangGraph
        setTimeout(() => {
            this.emitThinking('processing', `Analyzing: "${content.slice(0, 50)}..."`);

            // Simulate completion
            setTimeout(() => {
                this.emitThinking('completed', 'Ready to respond.');
                this.isProcessing = false;

                // Phase 2: Will emit AGENT_SPEAK or AGENT_NAVIGATE here
                console.log('[TheiaAgent] Processing complete. (LangGraph integration pending)');
            }, 500);
        }, 300);
    }

    // --- Emit Helpers ---

    private emitThinking(
        stage: AgentThinkingEvent['payload']['stage'],
        message?: string
    ): void {
        const event: AgentThinkingEvent = {
            type: 'AGENT_THINKING',
            payload: {
                stage,
                message,
                timestamp: Date.now()
            }
        };

        eventBus.emit(event, 'agent');
    }

    // --- Public API ---

    /**
     * Check if agent is currently processing a request.
     */
    public isBusy(): boolean {
        return this.isProcessing;
    }

    /**
     * Get recent event history from the bus (for debugging).
     */
    public getEventHistory(count = 10): EventEnvelope[] {
        return eventBus.getRecentEvents(count);
    }
}

// Export Singleton
export const theiaAgent = new TheiaAgent();
