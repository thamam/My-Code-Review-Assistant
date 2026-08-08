
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../../../src/modules/core/EventBus';
import { TraceService } from '../../../src/modules/core/TraceService';
import { LocalFlightRecorder } from '../../../src/modules/core/FlightRecorder';
import { FlightRecorder, TraceEntry, EventEnvelope } from '../../../src/modules/core/types';

// Mock Agent
const mockAgent = {
    getState: vi.fn().mockReturnValue({ messages: [], context: {} })
};

// Mock FlightRecorder — isolates TraceService's projection logic from
// LocalFlightRecorder's persistence logic (covered separately below).
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

    it('should persist a bounded projection of AgentState, excluding prData and activeFileContent', async () => {
        const testState = {
            messages: [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'reply' }],
            context: { activeFile: 'test.ts', activeFileContent: 'x'.repeat(1000), activeTab: 'files' },
            prData: { id: 123, hugePayload: 'y'.repeat(1000) },
            plan: { id: 'p1', goal: 'fix bug', steps: [], activeStepIndex: 2, status: 'executing', generatedAt: 0 },
            pendingAction: { tool: 'edit_file', args: {}, rationale: 'because' },
        };
        mockAgent.getState.mockReturnValue(testState);

        eventBus.emit({ type: 'SESSION_RESET', payload: { reason: 'new_session' } } as any);

        await new Promise(resolve => setTimeout(resolve, 10));

        const entries = await recorder.getEntries();

        // Exact projection — no prData, no activeFileContent, no raw state passthrough
        expect(entries[0].state).toEqual({
            messageCount: 2,
            planStatus: 'executing',
            planActiveStepIndex: 2,
            pendingAction: 'edit_file',
            activeFile: 'test.ts',
        });

        const serialized = JSON.stringify(entries[0].state);
        expect(serialized).not.toContain('hugePayload');
        expect(serialized).not.toContain('activeFileContent');
        expect(entries[0].state).not.toHaveProperty('prData');
    });
});

describe('LocalFlightRecorder (coalesced persistence)', () => {
    // Minimal storage mock — vitest environment is 'node' so there is no real localStorage.
    function createStorageMock() {
        const store: Record<string, string> = {};
        return {
            store,
            getItem: vi.fn((key: string) => store[key] ?? null),
            setItem: vi.fn((key: string, value: string) => { store[key] = String(value); }),
            removeItem: vi.fn((key: string) => { delete store[key]; }),
            clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
        };
    }

    let mockLocal: ReturnType<typeof createStorageMock>;

    function makeEntry(id: string): TraceEntry {
        return {
            envelope: { id, event: { type: 'AGENT_THINKING' } as any, timestamp: 0, source: 'system' } as EventEnvelope,
            state: null,
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        mockLocal = createStorageMock();
        (globalThis as any).localStorage = mockLocal;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (globalThis as any).localStorage;
    });

    it('coalesces many rapid record() calls into a single localStorage write', async () => {
        const recorder = new LocalFlightRecorder();

        for (let i = 0; i < 50; i++) {
            await recorder.record(makeEntry(String(i)));
        }

        // No write should happen synchronously, no matter how many records land
        expect(mockLocal.setItem).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1000);

        expect(mockLocal.setItem).toHaveBeenCalledTimes(1);
        const [key, value] = mockLocal.setItem.mock.calls[0];
        expect(key).toBe('theia_flight_log');
        expect(JSON.parse(value)).toHaveLength(50);
    });

    it('does not drop records that arrive after the flush timer starts but before it fires', async () => {
        const recorder = new LocalFlightRecorder();

        await recorder.record(makeEntry('a'));
        await vi.advanceTimersByTimeAsync(500);
        await recorder.record(makeEntry('b')); // arrives mid-flight

        await vi.advanceTimersByTimeAsync(500);

        expect(mockLocal.setItem).toHaveBeenCalledTimes(1);
        const written = JSON.parse(mockLocal.setItem.mock.calls[0][1]);
        expect(written.map((e: TraceEntry) => e.envelope.id)).toEqual(['a', 'b']);
    });

    it('logs a warning and does not throw when localStorage.setItem fails (quota exceeded)', async () => {
        mockLocal.setItem.mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const recorder = new LocalFlightRecorder();
        await expect(recorder.record(makeEntry('a'))).resolves.not.toThrow();
        await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('[LocalFlightRecorder]');

        warnSpy.mockRestore();
    });
});
