
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus } from '../../../src/modules/core/EventBus';
import { TraceService } from '../../../src/modules/core/TraceService';
import { FlightRecorder, TraceEntry } from '../../../src/modules/core/types';

// Mock Agent
const mockAgent = {
    getState: vi.fn().mockReturnValue({ messages: [], context: {} })
};

// Mock FlightRecorder
class MockFlightRecorder implements FlightRecorder {
    entries: TraceEntry[] = [];
    async record(entry: TraceEntry) {
        this.entries.push(entry);
    }
    async getEntries() {
        return this.entries;
    }
    async clear() {
        this.entries = [];
    }
}

describe('TraceService (Operation Glass Box)', () => {
    let recorder: MockFlightRecorder;
    let service: TraceService;

    beforeEach(() => {
        recorder = new MockFlightRecorder();
        service = new TraceService(mockAgent as any, recorder);
    });

    it('should capture events from the EventBus and record them', async () => {
        // 1. Setup
        const testEvent = { type: 'AGENT_THINKING', payload: { stage: 'started', timestamp: Date.now() } };
        
        // 2. Execute
        eventBus.emit(testEvent as any, 'agent');

        // 3. Verify
        // We wait a tick because TraceService should ideally be async/non-blocking
        await new Promise(resolve => setTimeout(resolve, 10));

        const entries = await recorder.getEntries();
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].envelope.event.type).toBe('AGENT_THINKING');
    });

    it('should include AgentState in the trace envelope', async () => {
        const testState = { messages: [{ role: 'user', content: 'test' }], context: { file: 'test.ts' } };
        mockAgent.getState.mockReturnValue(testState);

        eventBus.emit({ type: 'SESSION_RESET', payload: { reason: 'new_session' } } as any);

        await new Promise(resolve => setTimeout(resolve, 10));

        const entries = await recorder.getEntries();
        expect(entries[0].state).toEqual(testState);
    });
});
