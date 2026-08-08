
import { FlightRecorder, TraceEntry } from "./types";

/**
 * LocalFlightRecorder
 * 
 * Simple persistence layer for traces using an in-memory buffer.
 * In a production environment, this would flush to LocalStorage or a remote endpoint.
 */
export class LocalFlightRecorder implements FlightRecorder {
    private entries: TraceEntry[] = [];
    private readonly MAX_ENTRIES = 500;
    private readonly FLUSH_INTERVAL_MS = 1000;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private dirty = false;

    async record(entry: TraceEntry): Promise<void> {
        this.entries.push(entry);

        // Ring buffer logic for memory safety
        if (this.entries.length > this.MAX_ENTRIES) {
            this.entries.shift();
        }

        // Persist to LocalStorage for "session permanence" — coalesced, not per-record
        this.scheduleFlush();
    }

    async getEntries(): Promise<TraceEntry[]> {
        return [...this.entries];
    }

    async clear(): Promise<void> {
        this.entries = [];
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.dirty = false;
        localStorage.removeItem('theia_flight_log');
    }

    /**
     * Coalesces bursts of record() calls into a single write: marks dirty and,
     * if a flush isn't already pending, schedules one. Because the timer reads
     * `this.entries` at fire time (not a snapshot taken at schedule time), any
     * records that arrive while the timer is pending are captured by that same
     * flush — no record is ever dropped.
     */
    private scheduleFlush() {
        this.dirty = true;
        if (this.flushTimer !== null) {
            return;
        }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            if (this.dirty) {
                this.dirty = false;
                this.persistToDisk();
            }
        }, this.FLUSH_INTERVAL_MS);
    }

    private persistToDisk() {
        try {
            // Persist frequently for traceability (especially in E2E tests)
            localStorage.setItem('theia_flight_log', JSON.stringify(this.entries.slice(-100)));
        } catch (e) {
            // LocalStorage may be full (QuotaExceededError) or unavailable — don't lose the failure silently.
            console.warn('[LocalFlightRecorder] Failed to persist flight log to localStorage:', e);
        }
    }

    /**
     * Factory method to load from disk
     */
    public static loadFromDisk(): LocalFlightRecorder {
        const recorder = new LocalFlightRecorder();
        try {
            const saved = localStorage.getItem('theia_flight_log');
            if (saved) {
                recorder.entries = JSON.parse(saved);
            }
        } catch (e) {}
        return recorder;
    }
}
