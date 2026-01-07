/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Phase 12.2: The Planner - Deliberative Reasoning.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { eventBus } from "./EventBus";
import { AgentPlan, PlanStep } from "../planner/types";

// --- Types ---

interface AgentState {
  messages: { role: string; content: string }[];
  context: any; // The UserContextState passed from UI
  prData: any;  // PR metadata
  plan?: AgentPlan; // The Cortex - Deliberative Reasoning
  lastError?: string; // Phase 13: The reason for failure (Trauma Memory)
}

// --- Planner Tools (Forces Structured Output) ---
const plannerTools: FunctionDeclaration[] = [
  {
    name: "submit_plan",
    description: "Submit a step-by-step plan to achieve the user's goal.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        goal: { type: Type.STRING, description: "The high-level goal." },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: "What to do in this step." },
              tool: { type: Type.STRING, description: "The tool to use (e.g., run_terminal_command, navigate_to_code)." }
            },
            required: ["description"]
          }
        }
      },
      required: ["goal", "steps"]
    }
  }
];

// --- Executor Tools (The Hands) ---
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
        tab_name: { type: Type.STRING, enum: ["files", "annotations", "issue", "diagrams", "terminal"] }
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
  },
  {
    name: "run_terminal_command",
    description: "Execute a shell command in the runtime terminal. Use this to run tests, install packages, check node version, or verify builds.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: "The command to run (e.g., 'npm', 'node', 'ls')" },
        args: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Arguments for the command" }
      },
      required: ["command"]
    }
  }
];

// Combined Tools for Executor (The Full Toolset)
const executorTools = [...uiTools];

class TheiaAgent {
  private ai: GoogleGenAI;
  private model: string = 'gemini-2.0-flash-exp';
  private chatSession: any = null;
  private workflow: any;
  private unsubscribeTemp: (() => void) | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    // 1. Define the Graph
    const graph = new StateGraph<AgentState>({
      channels: {
        messages: { reducer: (x: any, y: any) => x.concat(y) },
        context: { reducer: (x: any, y: any) => y }, // Latest wins
        prData: { reducer: (x: any, y: any) => y },
        plan: { reducer: (x: any, y: any) => y || x }, // Simple overwrite
        lastError: { reducer: (x: any, y: any) => y } // Phase 13: Overwrite with latest error
      }
    });

    // Phase 12.3: Planner -> Executor Loop
    graph.addNode("planner", this.plannerNode.bind(this));
    graph.addNode("executor", this.executorNode.bind(this));

    // Define Edges
    (graph as any).addEdge(START, "planner");
    (graph as any).addEdge("planner", "executor"); // Pass plan to executor

    // The Loop: Executor decides whether to repeat, replan, or finish
    (graph as any).addConditionalEdges(
      "executor",
      this.routePlan.bind(this),
      {
        executor: "executor",
        planner: "planner", // Phase 13.2: Self-correction path
        [END]: END
      }
    );

    // 2. Compile
    this.workflow = graph.compile();

    // 3. Subscribe to Nervous System
    eventBus.subscribe('USER_MESSAGE', async (envelope) => {
      const event = envelope.event;
      if (event.type === 'USER_MESSAGE') {
        const { content, text, context, prData } = event.payload;
        await this.process(content || text || '', context, prData);
      }
    });

    console.log('[TheiaAgent] Initialized with Planner + Executor Loop. Phase 12.3 Active.');
  }

  /**
   * Conditional Edge: Route Plan
   * Decides whether to loop back to executor, reroute to planner for repair, or end.
   * Phase 13.2: Self-Correction Path
   */
  private routePlan(state: AgentState): string {
    const { plan } = state;

    // Safety Rail (The Governor): Prevent infinite loops
    if (plan && plan.activeStepIndex > 15) {
      console.warn('[Governor] Max steps exceeded. Aborting.');
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: 'Safety limit reached: Maximum steps exceeded. Stopping execution.' }
      });
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });
      return END;
    }

    // NEW: Self-Correction Path
    // If the plan failed, send it back to the Planner to fix it.
    if (plan && plan.status === 'failed') {
      console.log('[Governor] Failure detected. Rerouting to Planner for repair.');
      return "planner";
    }

    // Standard Loop
    if (plan && plan.status === 'executing' && plan.activeStepIndex < plan.steps.length) {
      return "executor"; // Loop back
    }

    return END; // Done
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
   * Node: Planner (The "Architect" - Phase 12.2 + Phase 13.2 Repair Mode)
   * Analyzes user request and creates a step-by-step plan.
   * In REPAIR MODE: Generates a fix-oriented plan based on the last error.
   */
  private async plannerNode(state: AgentState) {
    const { context, prData, plan, lastError } = state;
    const userMsg = state.messages[state.messages.length - 1];

    console.log('[Agent] Planner Active.');

    // Safety check
    if (!userMsg || !userMsg.content) {
      console.error('[TheiaAgent] No user message found in state');
      return { plan: undefined };
    }

    // DETECT MODE: Standard vs. Repair
    const isRepairMode = plan && plan.status === 'failed';

    let systemInstruction = `You are Theia's Planner (Level 5 Architect).
Your job is to analyze the user request and break it down into atomic, executable steps.
DO NOT execute the steps. Just plan them.
Available Tools: run_terminal_command, navigate_to_code, change_tab.
Context: File: ${context?.activeFile}, Repo: ${prData?.title}`;

    let prompt = userMsg.content;

    // INJECT REPAIR CONTEXT
    if (isRepairMode) {
      console.log('[Planner] Entering REPAIR MODE.');

      systemInstruction += `

CRITICAL UPDATE: REPAIR MODE
The previous plan FAILED.
Failed Step: "${plan.steps[plan.activeStepIndex]?.description || 'Unknown'}"
Error Output: "${lastError}"

YOUR TASK:
1. Analyze the error.
2. Create a NEW plan that fixes the error and achieves the original goal.
3. The first step of the new plan should likely be a diagnostic or a fix.`;

      // Override the prompt to focus the LLM on the fix
      prompt = `The previous plan failed with this error: ${lastError}. Please make a new plan to fix this and achieve the goal: "${plan.goal}".`;
    }

    // 1. Initialize Planner Session
    const planningSession = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: plannerTools }]
      }
    });

    // 2. Ask for the Plan
    const response = await planningSession.sendMessage({ message: prompt });

    // 3. Extract the Plan (Function Call)
    const functionCalls = response?.functionCalls || [];
    let newPlan: AgentPlan | undefined;

    if (functionCalls.length > 0 && functionCalls[0].name === 'submit_plan') {
      const args = functionCalls[0].args as any;
      newPlan = {
        id: `plan-${Date.now()}`, // New ID
        goal: args.goal,
        steps: args.steps.map((s: any, i: number): PlanStep => ({
          id: `step-${i}`,
          description: s.description,
          tool: s.tool,
          status: 'pending'
        })),
        activeStepIndex: 0, // Reset pointer
        status: 'executing', // Ready to run immediately
        generatedAt: Date.now()
      };

      // Broadcast the thought
      eventBus.emit({
        type: 'AGENT_PLAN_CREATED',
        payload: { plan: newPlan }
      });

      // UX feedback (context-aware)
      const speakText = isRepairMode
        ? `Plan failed. I have created a new repair plan: ${newPlan.goal}`
        : `I have created a plan with ${newPlan.steps.length} steps: ${newPlan.goal}`;

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: speakText }
      });

      console.log('[Agent] Plan created:', newPlan);
    } else {
      // LLM returned text instead of a plan - fallback
      const text = response?.text || '';
      if (text) {
        eventBus.emit({
          type: 'AGENT_SPEAK',
          payload: { text }
        });
      }
    }

    // Return state update (overwrite the old plan, clear error after replanning)
    return { plan: newPlan, lastError: undefined };
  }

  /**
   * Node: Executor
   * Takes the current step from the plan and executes it.
   */
  private async executorNode(state: AgentState) {
    console.log('[Agent] Executing Step...');
    const { plan, context, prData } = state;

    // Safety check
    if (!plan || plan.activeStepIndex >= plan.steps.length) {
      return { plan: { ...plan, status: 'completed' } };
    }

    const currentStep = plan.steps[plan.activeStepIndex];

    // 1. Verify Tool Binding (Debug)
    console.log('[Executor] Available Tools:', executorTools.map(t => t.name));
    if (executorTools.length === 0) {
      console.error('[CRITICAL] Executor has no tools!');
    }

    // 2. Create Execution Session with RIGID Directive
    const chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: `You are Theia's Execution Engine.
Your SOLE purpose is to call the function required to complete the current step.
DO NOT provide explanations. DO NOT apologize. DO NOT chat.
IMMEDIATELY call the tool "${currentStep.tool || 'appropriate_tool'}" with the necessary arguments.

Plan Context:
- Goal: "${plan.goal}"
- Current Step: "${currentStep.description}"
- Context: ${context?.activeFile}

FORCE: Output a Function Call.`,
        tools: [{ functionDeclarations: executorTools }]
      }
    });

    // 3. Trigger the LLM with forceful message
    const response = await chat.sendMessage({ message: "EXECUTE_NOW" });
    const functionCalls = response?.functionCalls || [];
    const functionCall = functionCalls[0];

    let stepResult = "No tool execution needed.";

    // 4. Execute Tool (if any) or handle fallback
    if (functionCall) {
      const { name, args } = functionCall;
      console.log(`[Executor] Calling ${name} with`, args);

      // UX: Notify user we are starting
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Running: ${name}` }
      });

      // WAIT for the result (The Observer)
      try {
        const output = await this.executeTool(name, args);
        stepResult = output; // Capture the real terminal output
      } catch (err: any) {
        stepResult = `Error: ${err.message}`;
      }

      // UX: Tell the user what we got
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Step ${plan.activeStepIndex + 1}: ${stepResult}` }
      });
    } else {
      // Fallback: Model returned text instead of tool call
      const textResponse = response?.text || '';
      console.warn('[Executor] Model returned text instead of tool:', textResponse);
      stepResult = `Failed to execute (model chatted): ${textResponse.substring(0, 100)}`;
    }

    // 5. Analyze Result (The Judge)
    // We look for the [Exit Code: N] signature from executeCommandAndWait
    const exitCodeMatch = stepResult.match(/\[Exit Code: (\d+)\]/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

    // Determine Step Status
    const isSuccess = exitCode === 0;
    const stepStatus: PlanStep['status'] = isSuccess ? 'completed' : 'failed';

    // 6. Update the Plan
    const newSteps = [...plan.steps];
    newSteps[plan.activeStepIndex] = {
      ...currentStep,
      status: stepStatus,
      result: stepResult
    };

    // Critical Decision: Stop or Continue?
    let nextStatus: AgentPlan['status'] = plan.status;
    let nextIndex = plan.activeStepIndex;

    if (isSuccess) {
      // Success: Advance pointer
      nextIndex++;
      // If we ran out of steps, we are done
      if (nextIndex >= plan.steps.length) {
        nextStatus = 'completed';
      }
    } else {
      // Failure: Capture the error instead of just logging
      console.warn(`[Executor] Step ${plan.activeStepIndex + 1} Failed. Capturing error.`);

      nextStatus = 'failed';
      // We do NOT increment nextIndex, so the plan freezes at the failure point

      // Phase 13: Return the error to state for self-correction
      const updatedPlan: AgentPlan = {
        ...plan,
        steps: newSteps,
        activeStepIndex: nextIndex,
        status: nextStatus
      };

      return {
        plan: updatedPlan,
        lastError: stepResult // Pass the terminal output (which contains the error) to state
      };
    }

    const updatedPlan: AgentPlan = {
      ...plan,
      steps: newSteps,
      activeStepIndex: nextIndex,
      status: nextStatus
    };

    // UX: Speak the result
    if (!isSuccess) {
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Step Failed: ${stepResult}` }
      });
    }

    // Emit completion signal when plan ends (success or failure)
    if (updatedPlan.status === 'completed' || updatedPlan.status === 'failed') {
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });
      if (updatedPlan.status === 'completed') {
        eventBus.emit({
          type: 'AGENT_SPEAK',
          payload: { text: `Plan completed: ${plan.goal}` }
        });
      }
    }

    // Return partial state update
    return { plan: updatedPlan };
  }

  /**
   * Node: Reasoning (The "Brain" with Hands)
   * Now handles functionCall -> functionResponse loop
   * NOTE: Currently disconnected in Phase 12.2 (planner -> END)
   */
  private async reasoningNode(state: AgentState) {
    const { context, prData } = state;
    const userMsg = state.messages[state.messages.length - 1];

    // Safety check: Ensure we have a valid message
    if (!userMsg || !userMsg.content) {
      console.error('[TheiaAgent] No user message found in state');
      return { messages: [] };
    }

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

    // Ensure message content is a valid non-empty string
    const messageContent = String(userMsg.content || '').trim();
    if (!messageContent) {
      console.error('[TheiaAgent] Empty message content');
      return { messages: [] };
    }

    let response = await this.chatSession.sendMessage({ message: messageContent + contextSuffix });

    // =========================================================================
    // TOOL LOOP: Execute until we get a text response
    // =========================================================================
    let maxIterations = 10; // Safety limit
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      // Access functionCalls - SDK uses getter property, not method
      const functionCalls = response?.functionCalls || [];

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
      response = await this.chatSession.sendMessage({ message: functionResponseParts });
    }

    // Extract final text response - SDK uses getter property
    const text = response?.text || '';

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
   * Helper: Executes a runtime command and waits for the exit signal.
   * Captures stdout/stderr into a single string.
   */
  private async executeCommandAndWait(command: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
      let outputBuffer = '';

      // Definition of handlers
      const onOutput = (envelope: any) => {
        const event = envelope.event || envelope;
        if (event.type === 'RUNTIME_OUTPUT') {
          outputBuffer += event.payload.data;
        }
      };

      const onExit = (envelope: any) => {
        const event = envelope.event || envelope;
        if (event.type === 'RUNTIME_EXIT') {
          cleanup();
          const exitMsg = event.payload.exitCode === 0 ? '' : `\n[Exit Code: ${event.payload.exitCode}]`;
          resolve(outputBuffer + exitMsg);
        }
      };

      // Cleanup to prevent memory leaks
      const cleanup = () => {
        this.unsubscribeTemp?.();
      };

      // Subscribe to EventBus (using wildcard to catch all events)
      const unsubOutput = eventBus.subscribe('RUNTIME_OUTPUT', onOutput);
      const unsubExit = eventBus.subscribe('RUNTIME_EXIT', onExit);

      this.unsubscribeTemp = () => {
        unsubOutput();
        unsubExit();
      };

      // Trigger the Nervous System
      eventBus.emit({
        type: 'AGENT_EXEC_CMD',
        payload: { command, args, timestamp: Date.now() }
      });
    });
  }

  /**
   * Execute a tool by emitting the corresponding event
   * Returns a Promise<string> for async tools like terminal commands
   */
  private async executeTool(name: string, args: any): Promise<string> {
    const timestamp = Date.now();

    // 1. Runtime Tools (Async/Observed)
    if (name === 'run_terminal_command') {
      return this.executeCommandAndWait(args.command, args.args || []);
    }

    // 2. UI Tools (Sync/Fire-and-Forget)
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
        return `Mapped to ${args.filepath}`;

      case 'change_tab':
        eventBus.emit({
          type: 'AGENT_TAB_SWITCH',
          payload: {
            tab: args.tab_name,
            timestamp
          }
        });
        console.log(`[TheiaAgent] AGENT_TAB_SWITCH emitted: ${args.tab_name}`);
        return `Switched tab to ${args.tab_name}`;

      case 'toggle_diff_mode':
        eventBus.emit({
          type: 'AGENT_DIFF_MODE',
          payload: {
            enable: args.enable,
            timestamp
          }
        });
        console.log(`[TheiaAgent] AGENT_DIFF_MODE emitted: ${args.enable}`);
        return `Toggled Diff Mode`;

      default:
        console.warn(`[TheiaAgent] Unknown tool: ${name}`);
        return "Unknown tool";
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
