
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

    async record(entry: TraceEntry): Promise<void> {
        this.entries.push(entry);
        
        // Ring buffer logic for memory safety
        if (this.entries.length > this.MAX_ENTRIES) {
            this.entries.shift();
        }
        
        // Optional: Persist to LocalStorage for "session permanence"
        this.persistToDisk();
    }

    async getEntries(): Promise<TraceEntry[]> {
        return [...this.entries];
    }

    async clear(): Promise<void> {
        this.entries = [];
        localStorage.removeItem('theia_flight_log');
    }

    private persistToDisk() {
        try {
            // Persist frequently for traceability (especially in E2E tests)
            // In a real high-throughput prod app, we'd debounce this.
            localStorage.setItem('theia_flight_log', JSON.stringify(this.entries.slice(-100)));
        } catch (e) {
            // LocalStorage might be full or unavailable
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
