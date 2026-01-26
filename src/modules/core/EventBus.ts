/**
 * src/modules/core/EventBus.ts
 * The Nervous System: Central event dispatcher for Theia.
 * Implements pub/sub pattern with ring buffer for observability.
 */

import { TheiaEvent, EventEnvelope } from './types';

type EventHandler = (envelope: EventEnvelope) => void;
type EventType = TheiaEvent['type'];

class EventBus {
    private handlers: Map<EventType | '*', Set<EventHandler>> = new Map();

    // Black Box: Ring buffer for last 100 events
    private readonly HISTORY_SIZE = 100;
    private history: EventEnvelope[] = [];
    private historyIndex = 0;

    private eventCounter = 0;

    // --- Subscription API ---

    /**
     * Subscribe to specific event type(s) or '*' for all events.
     * Returns unsubscribe function.
     */
    public subscribe(
        eventType: EventType | EventType[] | '*',
        handler: EventHandler
    ): () => void {
        const types = Array.isArray(eventType) ? eventType : [eventType];

        for (const type of types) {
            if (!this.handlers.has(type)) {
                this.handlers.set(type, new Set());
            }
            this.handlers.get(type)!.add(handler);
        }

        // Return unsubscribe function
        return () => {
            for (const type of types) {
                this.handlers.get(type)?.delete(handler);
            }
        };
    }

    // --- Emit API ---

    /**
     * Emit an event to all subscribed handlers.
     * Automatically wraps in EventEnvelope and logs to history.
     */
    public emit(event: TheiaEvent, source: 'ui' | 'agent' | 'system' = 'system'): void {
        const envelope: EventEnvelope = {
            id: this.generateEventId(),
            event,
            timestamp: Date.now(),
            source
        };

        // Log to Black Box
        this.recordToHistory(envelope);

        // Dispatch to type-specific handlers
        const typeHandlers = this.handlers.get(event.type);
        if (typeHandlers) {
            typeHandlers.forEach(handler => {
                try {
                    handler(envelope);
                } catch (e) {
                    console.error(`[EventBus] Handler error for ${event.type}:`, e);
                }
            });
        }

        // Dispatch to wildcard handlers
        const wildcardHandlers = this.handlers.get('*');
        if (wildcardHandlers) {
            wildcardHandlers.forEach(handler => {
                try {
                    handler(envelope);
                } catch (e) {
                    console.error(`[EventBus] Wildcard handler error:`, e);
                }
            });
        }

        console.log(`[EventBus] Emitted: ${event.type}`, envelope);
    }

    // --- History / Observability API ---

    /**
     * Get event history (Black Box data).
     * Returns events in chronological order.
     */
    public getHistory(): EventEnvelope[] {
        // If buffer isn't full, return what we have
        if (this.history.length < this.HISTORY_SIZE) {
            return [...this.history];
        }

        // Ring buffer is full - reconstruct in order
        const result: EventEnvelope[] = [];
        for (let i = 0; i < this.HISTORY_SIZE; i++) {
            const idx = (this.historyIndex + i) % this.HISTORY_SIZE;
            if (this.history[idx]) {
                result.push(this.history[idx]);
            }
        }
        return result;
    }

    /**
     * Get last N events from history.
     */
    public getRecentEvents(count: number): EventEnvelope[] {
        const history = this.getHistory();
        return history.slice(-count);
    }

    /**
     * Filter history by event type.
     */
    public getEventsByType(type: EventType): EventEnvelope[] {
        return this.getHistory().filter(e => e.event.type === type);
    }

    // --- Internal Methods ---

    private recordToHistory(envelope: EventEnvelope): void {
        if (this.history.length < this.HISTORY_SIZE) {
            this.history.push(envelope);
        } else {
            this.history[this.historyIndex] = envelope;
            this.historyIndex = (this.historyIndex + 1) % this.HISTORY_SIZE;
        }
    }

    private generateEventId(): string {
        this.eventCounter++;
        return `evt_${Date.now()}_${this.eventCounter}`;
    }

    // --- Debug API ---

    /**
     * Get current subscriber counts (for debugging).
     */
    public getSubscriberCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        this.handlers.forEach((handlers, type) => {
            counts[type] = handlers.size;
        });
        return counts;
    }

    /**
     * Prints the event history table to console for debugging.
     */
    public dumpToConsole(count: number = 20): void {
        const events = this.getRecentEvents(count);
        console.groupCollapsed(`[EventBus] History Dump (${events.length} events)`);
        console.table(events.map(e => ({
            Time: new Date(e.timestamp).toISOString().split('T')[1],
            Source: e.source,
            Type: e.event.type,
            Payload: JSON.stringify(e.event.payload).substring(0, 50) + '...'
        })));
        console.groupEnd();
    }
}

// Export Singleton
export const eventBus = new EventBus();
