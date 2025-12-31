/**
 * src/modules/core/Agent.ts
 * TheiaAgent: The Brain - LangGraph StateGraph with Gemini.
 *
 * Phase 10.2: Full Neural Loop implementation.
 * - Receives USER_MESSAGE from EventBus
 * - Processes through LangGraph StateGraph
 * - Emits AGENT_SPEAK, AGENT_THINKING, AGENT_NAVIGATE
 */

import { StateGraph, END, START } from '@langchain/langgraph/web';
import { GoogleGenAI, Chat } from '@google/genai';
import { eventBus } from './EventBus';
import {
    EventEnvelope,
    UserMessageEvent,
    AgentSpeakEvent,
    AgentThinkingEvent,
    UIContext,
    isUserIntent
} from './types';

// ============================================================================
// STATE DEFINITION
// ============================================================================

interface AgentState {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    context: UIContext | null;
    currentResponse: string;
    isComplete: boolean;
}

// ============================================================================
// QUEUED MESSAGE TYPE
// ============================================================================

interface QueuedMessage {
    event: UserMessageEvent;
    envelope: EventEnvelope;
}

// ============================================================================
// THEIA AGENT CLASS
// ============================================================================

class TheiaAgent {
    private isProcessing = false;
    private messageQueue: QueuedMessage[] = [];
    private chatSession: Chat | null = null;
    private ai: GoogleGenAI | null = null;
    private currentModel = 'gemini-2.0-flash-exp';

    constructor() {
        this.initializeAI();
        this.subscribeToEvents();
        console.log('[TheiaAgent] Initialized. Neural Loop ready.');
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    private initializeAI(): void {
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                console.error('[TheiaAgent] VITE_GEMINI_API_KEY not found');
                return;
            }
            this.ai = new GoogleGenAI({ apiKey });
            console.log('[TheiaAgent] GoogleGenAI initialized.');
        } catch (e) {
            console.error('[TheiaAgent] Failed to initialize GoogleGenAI:', e);
        }
    }

    private subscribeToEvents(): void {
        console.log('[TheiaAgent] Subscribing to EventBus...');

        eventBus.subscribe(
            ['USER_MESSAGE', 'UI_INTERACTION', 'CODE_CHANGE'],
            this.handleIncomingEvent.bind(this)
        );

        console.log('[TheiaAgent] Subscribed to UserIntent events.');
    }

    // =========================================================================
    // EVENT HANDLING WITH QUEUE
    // =========================================================================

    private handleIncomingEvent(envelope: EventEnvelope): void {
        const { event } = envelope;
        if (!isUserIntent(event)) return;

        if (event.type === 'USER_MESSAGE') {
            this.enqueueMessage(event, envelope);
        } else {
            // Log other events for now
            console.log(`[TheiaAgent] ${event.type} received:`, event.payload);
        }
    }

    private enqueueMessage(event: UserMessageEvent, envelope: EventEnvelope): void {
        this.messageQueue.push({ event, envelope });
        console.log(`[TheiaAgent] Message queued. Queue size: ${this.messageQueue.length}`);

        // If not currently processing, start processing the queue
        if (!this.isProcessing) {
            this.processNextMessage();
        }
    }

    private async processNextMessage(): Promise<void> {
        if (this.messageQueue.length === 0) {
            return;
        }

        const queuedMessage = this.messageQueue.shift()!;
        this.isProcessing = true;

        try {
            await this.handleUserMessage(queuedMessage.event, queuedMessage.envelope);
        } catch (e) {
            console.error('[TheiaAgent] Error processing message:', e);
            this.emitThinking('completed', 'An error occurred while processing your request.');
        } finally {
            this.isProcessing = false;
            // Process next message in queue if any
            if (this.messageQueue.length > 0) {
                // Use setTimeout to avoid stack overflow on large queues
                setTimeout(() => this.processNextMessage(), 0);
            }
        }
    }

    // =========================================================================
    // MESSAGE PROCESSING - THE NEURAL LOOP
    // =========================================================================

    private async handleUserMessage(event: UserMessageEvent, envelope: EventEnvelope): Promise<void> {
        const { content, context } = event.payload;
        console.log(`[TheiaAgent] Processing USER_MESSAGE: "${content.slice(0, 50)}..."`);

        // 1. Emit THINKING started
        this.emitThinking('started', 'Processing your request...');

        // 2. Build or refresh chat session with context
        this.refreshChatSession(context);

        if (!this.chatSession) {
            console.error('[TheiaAgent] No chat session available');
            this.emitSpeak('msg_' + Date.now(), 'I apologize, but I am not properly initialized. Please refresh the page.', true);
            return;
        }

        // 3. Build context-enriched message
        const enrichedMessage = this.buildEnrichedMessage(content, context);

        // 4. Execute the graph (single-node for Phase 1)
        await this.executeReasoningGraph(enrichedMessage, context);
    }

    private refreshChatSession(context: UIContext | null): void {
        if (!this.ai) {
            console.error('[TheiaAgent] AI not initialized');
            return;
        }

        const systemPrompt = this.buildSystemPrompt(context);

        this.chatSession = this.ai.chats.create({
            model: this.currentModel,
            config: {
                systemInstruction: systemPrompt
                // Tools disabled for Phase 1 - will re-enable in Phase 2
            }
        });
    }

    private buildSystemPrompt(context: UIContext | null): string {
        const prData = context?.prData;
        const linearIssue = context?.linearIssue;

        const manifest = prData?.files
            .map(f => `- ${f.path} (${f.status})`)
            .join('\n') || 'No files loaded';

        let systemInstruction = `You are Theia, a **Senior Staff Software Engineer**. Be direct, not a tutor.
Respond in the same language the user uses (primarily English or Hebrew).

## ⚠️ HARD CONSTRAINTS - VIOLATION = FAILURE

### 1. THE PROJECT MANIFEST IS ABSOLUTE TRUTH
The files listed below under "PROJECT MANIFEST" are the ONLY files that changed in this PR.
- **DO NOT invent files that are not in this list.**
- **DO NOT claim more files changed than are listed.**
- If you mention a file, it MUST appear in the manifest below.

### 2. NO GUESSING LINE NUMBERS
- **NEVER cite a line number unless you can see it in the "File Content" section of my message.**
- If I haven't shown you the file content, say: "I need to open that file to see the specific lines."
- Wrong: "Check line 44 for the bug" (when you haven't seen the file)
- Right: "I can see at line X..." (after viewing file content)

### 3. GROUNDED RESPONSES ONLY
- Every claim must be backed by evidence visible in the context.
- If you cannot see the code, acknowledge it.

## Current Context
- Current Tab: ${context?.activeTab || 'files'}
- Open File: ${context?.activeFile || 'None'}
- Selected Text: ${context?.activeSelection || 'None'}
- Active Diagram: ${context?.activeDiagram || 'None'}

## PR Information
PR: "${prData?.title || 'Unknown'}"
Author: ${prData?.author || 'Unknown'}
Description: ${prData?.description || 'No description'}

## PROJECT MANIFEST (ONLY these files changed - this is the TRUTH)
${manifest}
`;

        if (linearIssue) {
            systemInstruction += `
--- LINKED LINEAR ISSUE ---
ID: ${linearIssue.identifier}
Title: ${linearIssue.title}
Requirements: ${linearIssue.description}
`;
        }

        return systemInstruction;
    }

    private buildEnrichedMessage(content: string, context: UIContext | null): string {
        let enrichedMessage = content;

        // Add file content if user is viewing a file
        if (context?.activeFile && context?.prData?.files) {
            const fileData = context.prData.files.find(f => f.path === context.activeFile);
            if (fileData?.newContent) {
                const numberedLines = fileData.newContent
                    .split('\n')
                    .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
                    .join('\n');

                enrichedMessage += `

[FILE CONTENT - USE THIS FOR LINE REFERENCES]
File: ${context.activeFile}
\`\`\`
${numberedLines}
\`\`\``;
            }
        }

        // Add system context suffix
        enrichedMessage += `

[SYSTEM INJECTION - CURRENT VIEW]
User is looking at: ${context?.activeFile || 'No file open'}
Current Tab: ${context?.activeTab || 'files'}
Selected Text: ${context?.activeSelection || 'None'}
Active Diagram: ${context?.activeDiagram || 'None'}`;

        return enrichedMessage;
    }

    // =========================================================================
    // LANGGRAPH STATE MACHINE (Single Node for Phase 1)
    // =========================================================================

    private async executeReasoningGraph(message: string, context: UIContext | null): Promise<void> {
        const messageId = 'msg_' + Date.now();

        try {
            // Create the state graph
            const graph = new StateGraph<AgentState>({
                channels: {
                    messages: { default: () => [] },
                    context: { default: () => null },
                    currentResponse: { default: () => '' },
                    isComplete: { default: () => false }
                }
            });

            // Add the reasoning node
            graph.addNode('reasoning', async (state: AgentState) => {
                return await this.reasoningNode(state, messageId);
            });

            // Define edges
            graph.addEdge(START, 'reasoning');
            graph.addEdge('reasoning', END);

            // Compile and execute
            const app = graph.compile();

            const initialState: AgentState = {
                messages: [{ role: 'user', content: message }],
                context,
                currentResponse: '',
                isComplete: false
            };

            // Execute the graph
            await app.invoke(initialState);

            this.emitThinking('completed');

        } catch (e) {
            console.error('[TheiaAgent] Graph execution error:', e);
            this.emitSpeak(messageId, 'I encountered an error processing your request. Please try again.', true);
            this.emitThinking('completed');
        }
    }

    private async reasoningNode(state: AgentState, messageId: string): Promise<Partial<AgentState>> {
        if (!this.chatSession) {
            return { currentResponse: 'No chat session', isComplete: true };
        }

        this.emitThinking('processing', 'Thinking...');

        const userMessage = state.messages[state.messages.length - 1]?.content || '';
        let fullResponse = '';

        try {
            // Use streaming for real-time response
            const responseStream = await this.chatSession.sendMessageStream({
                message: userMessage
            });

            for await (const chunk of responseStream) {
                if (chunk.text) {
                    fullResponse += chunk.text;
                    // Emit streaming update
                    this.emitSpeak(messageId, fullResponse, false, true);
                }
            }

            // Emit final response
            this.emitSpeak(messageId, fullResponse, true, false);

            return {
                currentResponse: fullResponse,
                isComplete: true,
                messages: [...state.messages, { role: 'assistant' as const, content: fullResponse }]
            };

        } catch (e) {
            console.error('[TheiaAgent] Reasoning node error:', e);
            const errorMsg = 'I apologize, but I encountered an issue. Please try again.';
            this.emitSpeak(messageId, errorMsg, true, false);
            return { currentResponse: errorMsg, isComplete: true };
        }
    }

    // =========================================================================
    // EVENT EMITTERS
    // =========================================================================

    private emitThinking(
        stage: AgentThinkingEvent['payload']['stage'],
        message?: string
    ): void {
        try {
            const event: AgentThinkingEvent = {
                type: 'AGENT_THINKING',
                payload: {
                    stage,
                    message,
                    timestamp: Date.now()
                }
            };
            eventBus.emit(event, 'agent');
        } catch (e) {
            console.error('[TheiaAgent] Failed to emit AGENT_THINKING:', e);
        }
    }

    private emitSpeak(
        messageId: string,
        content: string,
        isFinal: boolean,
        isStreaming: boolean = false
    ): void {
        try {
            const event: AgentSpeakEvent = {
                type: 'AGENT_SPEAK',
                payload: {
                    messageId,
                    content,
                    isStreaming,
                    isFinal,
                    mode: 'text',
                    priority: 'normal',
                    timestamp: Date.now()
                }
            };
            eventBus.emit(event, 'agent');
        } catch (e) {
            console.error('[TheiaAgent] Failed to emit AGENT_SPEAK:', e);
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    public isBusy(): boolean {
        return this.isProcessing;
    }

    public getQueueSize(): number {
        return this.messageQueue.length;
    }

    public getEventHistory(count = 10): EventEnvelope[] {
        return eventBus.getRecentEvents(count);
    }
}

// Export Singleton
export const theiaAgent = new TheiaAgent();
