import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentGraph, AgentState } from '../../../src/modules/core/graph';
import { eventBus } from '../../../src/modules/core/EventBus';
import * as DirectorService from '../../../src/services/DirectorService';

// Mock DirectorService
vi.mock('../../../src/services/DirectorService', () => ({
    generatePrecisionResponse: vi.fn(),
    buildDirectorPrompt: vi.fn(),
    DIRECTOR_SYSTEM_PROMPT: 'mock-prompt'
}));

// Mock NavigationService
vi.mock('../../../src/modules/navigation/NavigationService', () => ({
    navigationService: {
        getState: vi.fn().mockReturnValue({ lazyFiles: new Map() })
    }
}));

describe('LangGraph Control Plane (Phase 10 & 11)', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should classify "npm test" as command and execute toolExecution', async () => {
        const initialState: Partial<AgentState> = {
            userIntent: {
                type: 'USER_MESSAGE',
                payload: {
                    text: 'run npm test',
                    timestamp: Date.now()
                }
            },
            messages: []
        };

        // 1. Setup execution simulator
        // When the graph emits AGENT_EXEC_CMD, we simulate the runtime
        eventBus.subscribe('AGENT_EXEC_CMD', (envelope) => {
            // Simulate some output
            eventBus.emit({
                type: 'RUNTIME_OUTPUT',
                payload: { stream: 'stdout', data: 'Test Passed!' }
            });
            // Simulate exit
            eventBus.emit({
                type: 'RUNTIME_EXIT',
                payload: { exitCode: 0 }
            });
        });

        // 2. Invoke Graph
        const finalState = await agentGraph.invoke(initialState);

        // 3. Assertions
        expect(finalState.classification).toBe('command');
        expect((finalState.toolOutput as any)?.success).toBe(true);
        expect((finalState.toolOutput as any)?.data.stdout).toContain('Test Passed!');
        
        // 4. Verify Synthesis (Dual-Track)
        expect((finalState.responsePlan as any)?.voice).toContain('finished successfully');
        expect((finalState.responsePlan as any)?.screen?.payload.content).toContain('### Command Execution Results');
        expect((finalState.responsePlan as any)?.screen?.payload.content).toContain('Test Passed!');
    });

    it('should classify general question as code_query and use deepReasoning', async () => {
        const initialState: Partial<AgentState> = {
            userIntent: {
                type: 'USER_MESSAGE',
                payload: {
                    text: 'How does the auth work?',
                    context: { activeFile: 'auth.ts' } as any,
                    timestamp: Date.now()
                }
            },
            messages: []
        };

        // Mock LLM Response
        (DirectorService.generatePrecisionResponse as any).mockResolvedValue({
            voice: "The auth uses JWT.",
            screen: "## Auth Details\n\nUses JWT tokens."
        });

        // Invoke
        const finalState = await agentGraph.invoke(initialState);

        // Assertions
        expect(finalState.classification).toBe('code_query');
        expect(finalState.reasoningMode).toBe('deep');
        expect(DirectorService.generatePrecisionResponse).toHaveBeenCalled();
        expect((finalState.responsePlan as any)?.voice).toBe("The auth uses JWT.");
    });
});
