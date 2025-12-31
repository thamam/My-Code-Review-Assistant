/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Replaces the ad-hoc logic in ChatContext.
 */

import { StateGraph, END } from "@langchain/langgraph";
import { GoogleGenAI, ChatSession, FunctionDeclaration, Type } from "@google/genai";
import { eventBus } from "./EventBus";
import { UserIntent } from "./types";

// --- Types ---

interface AgentState {
  messages: { role: string; content: string }[];
  context: any; // The UserContextState passed from UI
  prData: any;  // PR metadata
}

// --- Tools Definition (Moved from ChatContext) ---
const uiTools: FunctionDeclaration[] = [
  {
    name: "navigate_to_code",
    description: "Navigate to a specific file and line number.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filepath: { type: Type.STRING },
        line: { type: Type.NUMBER }
      },
      required: ["filepath"]
    }
  },
  {
    name: "change_tab",
    description: "Switch the application sidebar tab.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab_name: { type: Type.STRING, enum: ["files", "annotations", "issue", "diagrams"] }
      },
      required: ["tab_name"]
    }
  }
];

class TheiaAgent {
  private ai: GoogleGenAI;
  private model: string = 'gemini-2.0-flash-exp';
  private chatSession: ChatSession | null = null;
  private workflow: any;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    // 1. Define the Graph
    const graph = new StateGraph<AgentState>({
      channels: {
        messages: { reducer: (x: any, y: any) => x.concat(y) },
        context: { reducer: (x: any, y: any) => y }, // Latest wins
        prData: { reducer: (x: any, y: any) => y }
      }
    });

    graph.addNode("reasoning", this.reasoningNode.bind(this));
    graph.addEdge("start", "reasoning");
    graph.addEdge("reasoning", END);

    // 2. Compile
    this.workflow = graph.compile();

    // 3. Subscribe to Nervous System
    eventBus.subscribe(async (event) => {
      if (event.type === 'USER_MESSAGE') {
        const { text, context, prData } = event.payload;
        await this.process(text, context, prData);
      }
    });
  }

  /**
   * Main Entry Point
   */
  private async process(input: string, context: any, prData: any) {
    // Emit "Thinking" Signal
    eventBus.emit({ type: 'AGENT_THINKING', payload: { status: 'Analyzing...' }, timestamp: Date.now() });

    try {
      // Execute Graph
      await this.workflow.invoke({
        messages: [{ role: 'user', content: input }],
        context,
        prData
      });
    } catch (error: any) {
      console.error("[Agent] Graph Execution Failed:", error);
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `System Error: ${error.message}` },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Node: Reasoning (The "Brain")
   * Replicates the exact logic previously in ChatContext
   */
  private async reasoningNode(state: AgentState) {
    const { context, prData } = state;
    const userMsg = state.messages[state.messages.length - 1];

    // Lazy Init Session
    if (!this.chatSession) {
      this.chatSession = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction: this.buildSystemPrompt(context, prData),
          tools: [{ functionDeclarations: uiTools }]
        }
      });
    }

    // Context Injection (Hidden)
    const contextSuffix = `
[SYSTEM INJECTION]
User View: ${context.activeFile || 'None'}
Tab: ${context.activeTab}
Selection: ${context.activeSelection || 'None'}
`;

    const response = await this.chatSession.sendMessage(userMsg.content + contextSuffix);
    const text = response.response.text(); // Simplify for this iteration

    // Emit "Speak" Signal (Action)
    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: { text },
      timestamp: Date.now()
    });

    // Emit "Idle" Signal
    eventBus.emit({
      type: 'AGENT_THINKING',
      payload: { status: 'idle' },
      timestamp: Date.now()
    });

    return { messages: [{ role: 'assistant', content: text }] };
  }

  private buildSystemPrompt(context: any, prData: any): string {
    return `You are Theia, a Senior Staff Software Engineer.
PR: "${prData?.title || 'Unknown'}"
Be direct. Use tools proactively.
Current File: ${context?.activeFile || 'None'}`;
  }
}

export const agent = new TheiaAgent();
