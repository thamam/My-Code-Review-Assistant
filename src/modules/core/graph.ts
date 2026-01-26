/**
 * src/modules/core/graph.ts
 * The Control Plane: LangGraph State Machine for Theia Agent.
 * 
 * Implements the architecture defined in docs/architecture/02_AGENTIC_ORCHESTRATOR.md
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { UserIntent } from './types';
import { navigationService } from '../navigation/NavigationService';
import { eventBus } from './EventBus';
import { generatePrecisionResponse, DirectorInput } from '../../services/DirectorService';

// Define the State Schema
export interface AgentState {
    // The conversation history
    messages: BaseMessage[];
    
    // Input Signal
    userIntent?: any;
    
    // Internal Processing State
    classification?: 'code_query' | 'command' | 'chitchat' | 'ambiguous';
    
    context?: {
        activeFile?: string;
        activeFileContent?: string;
        relevantFiles?: string[];
        specAtoms?: string[];
        fetchedContent?: Map<string, string>;
    };
    
    reasoningMode?: 'standard' | 'deep';
    
    // Tool Outputs
    toolOutput?: {
        success: boolean;
        data: any;
        error?: string;
    };
    
    // Final Output Plan
    responsePlan?: {
        voice?: string;
        screen?: {
            action: string;
            payload: any;
        };
    };
}

// --- Node Implementations ---

async function intentClassification(state: AgentState): Promise<Partial<AgentState>> {
    eventBus.emit({ type: 'AGENT_THINKING', payload: { stage: 'started', message: 'Classifying intent...', timestamp: Date.now() } });
    
    const intent = state.userIntent;
    if (!intent || intent.type !== 'USER_MESSAGE') {
        return { classification: 'ambiguous' };
    }

    const text = (intent.payload.text || intent.payload.content || '').toLowerCase();
    
    // Basic Heuristics (Phase 10.1)
    if (text.includes('run') || text.includes('exec') || text.includes('test')) {
        return { classification: 'command' };
    }
    if (text.includes('hello') || text.includes('hi ') || text.length < 5) {
        return { classification: 'chitchat' };
    }
    
    // Default to code query
    return { classification: 'code_query' };
}

async function contextSelection(state: AgentState): Promise<Partial<AgentState>> {
    eventBus.emit({ type: 'AGENT_THINKING', payload: { stage: 'processing', message: 'Gathering context...', timestamp: Date.now() } });

    const activeFile = state.userIntent?.payload?.context?.activeFile;
    let activeFileContent = '';

    if (activeFile) {
        const navState = navigationService.getState();
        const lazyFile = navState.lazyFiles.get(activeFile);
        if (lazyFile && lazyFile.content) {
            activeFileContent = lazyFile.content;
        }
    }

    return { 
        context: { 
            activeFile: activeFile || 'unknown',
            activeFileContent: activeFileContent,
            relevantFiles: [] 
        } 
    };
}

async function precisionRouter(state: AgentState): Promise<Partial<AgentState>> {
    const classification = state.classification;
    if (classification === 'code_query') {
        return { reasoningMode: 'deep' };
    }
    return { reasoningMode: 'standard' };
}

async function standardReasoning(state: AgentState): Promise<Partial<AgentState>> {
    return {
        responsePlan: {
            voice: "I am ready to help with your code.",
            screen: { action: "none", payload: {} }
        }
    };
}

async function deepReasoning(state: AgentState): Promise<Partial<AgentState>> {
    eventBus.emit({ type: 'AGENT_THINKING', payload: { stage: 'processing', message: 'Analyzing with Gemini 3 Pro...', timestamp: Date.now() } });

    let userText = '';
    let prTitle = 'Unknown PR';
    let prDescription = '';

    if (state.userIntent?.type === 'USER_MESSAGE') {
        userText = state.userIntent.payload.text || state.userIntent.payload.content || '';
        if (state.userIntent.payload.prData) {
            prTitle = state.userIntent.payload.prData.title;
            prDescription = state.userIntent.payload.prData.description;
        }
    } else if (state.userIntent?.type === 'VOICE_INPUT') {
         userText = state.userIntent.payload.text;
    }

    const activeFile = state.context?.activeFile || '';
    const activeFileContent = state.context?.activeFileContent || '';
    
    const directorInput: DirectorInput = {
        filePath: activeFile,
        fileContent: activeFileContent,
        prTitle: prTitle,
        prDescription: prDescription,
        specAtoms: [] 
    };

    const response = await generatePrecisionResponse(userText, [], directorInput);

    if (response) {
        return {
            responsePlan: {
                voice: response.voice,
                screen: {
                    action: 'markdown_response',
                    payload: { content: response.screen }
                }
            }
        };
    }

    return {
        responsePlan: {
            voice: "I encountered an error analyzing the code.",
            screen: { action: "error", payload: { message: "Analysis failed" } }
        }
    };
}

async function toolExecution(state: AgentState): Promise<Partial<AgentState>> {
    const classification = state.classification;
    if (classification !== 'command') {
        return { toolOutput: { success: true, data: 'No command execution required' } };
    }

    const intent = state.userIntent;
    let command = '';
    
    if (intent?.type === 'USER_MESSAGE') {
        const text = (intent.payload.text || intent.payload.content || '').toLowerCase();
        if (text.includes('npm test')) command = 'npm test';
        else if (text.includes('ls')) command = 'ls';
        else if (text.includes('node')) {
            const match = text.match(/node\s+([^\s]+)/);
            command = match ? match[0] : 'node';
        }
    }

    if (!command) {
        return { toolOutput: { success: false, data: null, error: 'Could not extract command' } };
    }

    eventBus.emit({
        type: 'AGENT_THINKING', 
        payload: { stage: 'processing', message: `Executing: ${command}...`, timestamp: Date.now() } 
    });

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        
        const unsubOutput = eventBus.subscribe('RUNTIME_OUTPUT', (envelope) => {
            if (envelope.event.type === 'RUNTIME_OUTPUT') {
                if (envelope.event.payload.stream === 'stdout') stdout += envelope.event.payload.data;
                if (envelope.event.payload.stream === 'stderr') stderr += envelope.event.payload.data;
            }
        });

        const unsubExit = eventBus.subscribe('RUNTIME_EXIT', (envelope) => {
            if (envelope.event.type === 'RUNTIME_EXIT') {
                unsubOutput();
                unsubExit();
                
                resolve({
                    toolOutput: {
                        success: envelope.event.payload.exitCode === 0,
                        data: {
                            stdout,
                            stderr,
                            exitCode: envelope.event.payload.exitCode
                        }
                    }
                });
            }
        });

        eventBus.emit({
            type: 'AGENT_EXEC_CMD',
            payload: {
                command: command,
                args: [],
                timestamp: Date.now()
            }
        }, 'agent');

        setTimeout(() => {
            unsubOutput();
            unsubExit();
            resolve({
                toolOutput: {
                    success: false,
                    data: { stdout, stderr, exitCode: -1 },
                    error: 'Command execution timed out'
                }
            });
        }, 30000);
    });
}

async function responseSynthesis(state: AgentState): Promise<Partial<AgentState>> {
    eventBus.emit({ type: 'AGENT_THINKING', payload: { stage: 'completed', message: 'Synthesis complete.', timestamp: Date.now() } });

    if (state.classification === 'command' && state.toolOutput) {
        const { success, data, error } = state.toolOutput;
        const result = data as any;
        
        const voice = success 
            ? "Command finished successfully." 
            : `Command failed${error ? `: ${error}` : ''}.`;
            
        const screen = `### Command Execution Results
**Status:** ${success ? '✅ Success' : '❌ Failed'}
${error ? `**Error:** ${error}\n` : ''}

**Stdout:**
\`\`\`bash
${result?.stdout || '(empty)'}
\`\`\`

${result?.stderr ? `**Stderr:**\n\`\`\`bash\n${result.stderr}\n\`\`\`` : ''}
`;

        return {
            responsePlan: {
                voice,
                screen: { action: 'markdown_response', payload: { content: screen } }
            }
        };
    }

    return {};
}

// --- Graph Definition ---

const workflow = new StateGraph<AgentState>({
    channels: {
        messages: {
            reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
            default: () => [],
        },
        userIntent: { reducer: (x: any, y: any) => y ?? x },
        classification: { reducer: (x: any, y: any) => y ?? x },
        context: { reducer: (x: any, y: any) => y ?? x },
        reasoningMode: { reducer: (x: any, y: any) => y ?? x },
        toolOutput: { reducer: (x: any, y: any) => y ?? x },
        responsePlan: { reducer: (x: any, y: any) => y ?? x },
    }
});

workflow.addNode('intentClassification', intentClassification as any);
workflow.addNode('contextSelection', contextSelection as any);
workflow.addNode('precisionRouter', precisionRouter as any);
workflow.addNode('standardReasoning', standardReasoning as any);
workflow.addNode('deepReasoning', deepReasoning as any);
workflow.addNode('toolExecution', toolExecution as any);
workflow.addNode('responseSynthesis', responseSynthesis as any);

// @ts-ignore
workflow.addEdge(START, 'intentClassification');

workflow.addConditionalEdges(
    // @ts-ignore
    'intentClassification',
    (state: AgentState) => {
        if (state.classification === 'chitchat') {
            return 'responseSynthesis';
        }
        return 'contextSelection';
    }
);

// @ts-ignore
workflow.addEdge('contextSelection', 'precisionRouter');

workflow.addConditionalEdges(
    // @ts-ignore
    'precisionRouter',
    (state: AgentState) => {
        return state.reasoningMode === 'deep' ? 'deepReasoning' : 'standardReasoning';
    }
);

// @ts-ignore
workflow.addEdge('standardReasoning', 'toolExecution');
// @ts-ignore
workflow.addEdge('deepReasoning', 'toolExecution');
// @ts-ignore
workflow.addEdge('toolExecution', 'responseSynthesis');
// @ts-ignore
workflow.addEdge('responseSynthesis', END);

export const agentGraph = workflow.compile();