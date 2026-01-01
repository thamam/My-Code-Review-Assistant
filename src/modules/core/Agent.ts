/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Phase 10.3: Tool Loop Enabled - The Hands.
 */

import { StateGraph, END } from "@langchain/langgraph";
import { GoogleGenAI, ChatSession, FunctionDeclaration, Type } from "@google/genai";
import { eventBus } from "./EventBus";

// --- Types ---

interface AgentState {
  messages: { role: string; content: string }[];
  context: any; // The UserContextState passed from UI
  prData: any;  // PR metadata
}

// --- Tools Definition (The Hands) ---
const uiTools: FunctionDeclaration[] = [
  {
    name: "navigate_to_code",
    description: "Navigate to a specific file and line number in the code viewer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filepath: { type: Type.STRING, description: "The file path to navigate to" },
        line: { type: Type.NUMBER, description: "The line number to jump to" }
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
  },
  {
    name: "toggle_diff_mode",
    description: "Enable or disable diff mode to show/hide code changes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enable: { type: Type.BOOLEAN, description: "True to show diff, false to hide" }
      },
      required: ["enable"]
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

    console.log('[TheiaAgent] Initialized with Tool Loop. Hands connected.');
  }

  /**
   * Main Entry Point
   */
  private async process(input: string, context: any, prData: any) {
    // Emit "Thinking" Signal
    eventBus.emit({
      type: 'AGENT_THINKING',
      payload: { stage: 'started', message: 'Analyzing...', timestamp: Date.now() }
    });

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
        payload: { text: `System Error: ${error.message}` }
      });
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });
    }
  }

  /**
   * Node: Reasoning (The "Brain" with Hands)
   * Now handles functionCall -> functionResponse loop
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
User View: ${context?.activeFile || 'None'}
Tab: ${context?.activeTab || 'files'}
Selection: ${context?.activeSelection || 'None'}
`;

    let response = await this.chatSession.sendMessage(userMsg.content + contextSuffix);

    // =========================================================================
    // TOOL LOOP: Execute until we get a text response
    // =========================================================================
    let maxIterations = 10; // Safety limit
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      // Access functionCalls via response.response.functionCalls()
      const functionCalls = response.response.functionCalls();

      if (!functionCalls || functionCalls.length === 0) {
        // No function calls - we have a text response, break the loop
        break;
      }

      console.log(`[TheiaAgent] Tool Loop Iteration ${iteration}: ${functionCalls.length} function call(s)`);

      // Process each function call and emit corresponding events
      // Build function response parts array
      const functionResponseParts: Array<{ functionResponse: { name: string; response: { result: string } } }> = [];

      for (const fc of functionCalls) {
        console.log(`[TheiaAgent] Executing tool: ${fc.name}`, fc.args);

        // Emit the corresponding event based on function name
        this.executeTool(fc.name, fc.args);

        // Build function response part
        functionResponseParts.push({
          functionResponse: {
            name: fc.name,
            response: { result: 'OK' }
          }
        });
      }

      // Send function responses back to Gemini as array of Part objects
      response = await this.chatSession.sendMessage(functionResponseParts);
    }

    // Extract final text response via response.response.text()
    const text = response.response.text() || '';

    // Emit "Speak" Signal (Action)
    if (text) {
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text }
      });
    }

    // Emit "Completed" Signal
    eventBus.emit({
      type: 'AGENT_THINKING',
      payload: { stage: 'completed', timestamp: Date.now() }
    });

    return { messages: [{ role: 'assistant', content: text }] };
  }

  /**
   * Execute a tool by emitting the corresponding event
   */
  private executeTool(name: string, args: any): void {
    const timestamp = Date.now();

    switch (name) {
      case 'navigate_to_code':
        eventBus.emit({
          type: 'AGENT_NAVIGATE',
          payload: {
            target: {
              file: args.filepath,
              line: args.line || 1
            },
            reason: 'Tool execution',
            highlight: true,
            timestamp
          }
        });
        console.log(`[TheiaAgent] AGENT_NAVIGATE emitted: ${args.filepath}:${args.line || 1}`);
        break;

      case 'change_tab':
        eventBus.emit({
          type: 'AGENT_TAB_SWITCH',
          payload: {
            tab: args.tab_name,
            timestamp
          }
        });
        console.log(`[TheiaAgent] AGENT_TAB_SWITCH emitted: ${args.tab_name}`);
        break;

      case 'toggle_diff_mode':
        eventBus.emit({
          type: 'AGENT_DIFF_MODE',
          payload: {
            enable: args.enable,
            timestamp
          }
        });
        console.log(`[TheiaAgent] AGENT_DIFF_MODE emitted: ${args.enable}`);
        break;

      default:
        console.warn(`[TheiaAgent] Unknown tool: ${name}`);
    }
  }

  private buildSystemPrompt(context: any, prData: any): string {
    return `You are Theia, a Senior Staff Software Engineer reviewing code.
PR: "${prData?.title || 'Unknown'}"
Author: ${prData?.author || 'Unknown'}

Be direct and professional. Use tools proactively to navigate and demonstrate.
When discussing specific code, use navigate_to_code to show the user.
When switching context, use change_tab.
Use toggle_diff_mode to show or hide changes.

Current File: ${context?.activeFile || 'None'}
Current Tab: ${context?.activeTab || 'files'}`;
  }
}

export const agent = new TheiaAgent();
