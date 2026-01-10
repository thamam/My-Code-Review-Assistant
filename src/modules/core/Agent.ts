/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Phase 15: The Collaborator - Human-in-the-Loop.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { eventBus } from "./EventBus";
import { AgentPlan, PlanStep } from "../planner/types";
import { searchService } from '../search';

// --- Types ---

// Phase 15: Define the structure of an action waiting for approval
export interface PendingAction {
  tool: string;
  args: any;
  rationale: string; // "I need to edit this file to fix the bug..."
}

interface AgentState {
  messages: { role: string; content: string }[];
  context: any; // The UserContextState passed from UI
  prData: any;  // PR metadata
  plan?: AgentPlan; // The Cortex - Deliberative Reasoning
  lastError?: string; // Phase 13: The reason for failure (Trauma Memory)
  pendingAction?: PendingAction; // Phase 15: The "Held" action awaiting approval
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
  },
  {
    name: "write_file",
    description: "Create or overwrite a file with the specified content. Use this to create new files or modify existing ones.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "The file path relative to the project root (e.g., 'src/test.txt')" },
        content: { type: Type.STRING, description: "The content to write to the file" }
      },
      required: ["path", "content"]
    }
  }
];

// --- Knowledge Tools (The Librarian - Phase 14) ---
const knowledgeTools: FunctionDeclaration[] = [
  // Tool 1: Surface Search (MiniSearch) - Finds files by name
  {
    name: "find_file",
    description: "Find a file by its name. Use this to locate files when you know part of the filename.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The filename fragment (e.g., 'Agent', 'Service')" }
      },
      required: ["name"]
    }
  },
  // Tool 2: Deep Search (Grep) - Searches file content
  {
    name: "search_text",
    description: "Search for a text string or symbol inside ALL files. Use this to find where a class, function, or variable is defined.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "The exact string to search for (e.g., 'interface AgentState', 'function run')" }
      },
      required: ["query"]
    }
  }
];

// Combined Tools for Executor (The Full Toolset)
const executorTools = [...uiTools, ...knowledgeTools];

// Phase 15: The Gatekeeper - Sensitive tools require human approval
const SENSITIVE_TOOLS = ['run_terminal_command', 'write_file'];

class TheiaAgent {
  private ai: GoogleGenAI;
  private model: string = 'gemini-2.0-flash-exp';
  private chatSession: any = null;
  private workflow: any;
  private unsubscribeTemp: (() => void) | null = null;
  private state: AgentState | null = null; // Phase 15.2: Persisted state for resumption

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    // 1. Define the Graph
    const graph = new StateGraph<AgentState>({
      channels: {
        messages: { reducer: (x: any, y: any) => x.concat(y) },
        context: { reducer: (x: any, y: any) => y }, // Latest wins
        prData: { reducer: (x: any, y: any) => y },
        plan: { reducer: (x: any, y: any) => y || x }, // Simple overwrite
        lastError: { reducer: (x: any, y: any) => y }, // Phase 13: Overwrite with latest error
        pendingAction: { reducer: (x: any, y: any) => y } // Phase 15: Overwrite logic
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

    // Phase 15.2: Subscribe to User Approval events
    eventBus.subscribe('USER_APPROVAL', async (envelope) => {
      const event = envelope.event;
      if (event.type === 'USER_APPROVAL') {
        await this.resolvePendingAction(event.payload.approved);
      }
    });

    console.log('[TheiaAgent] Initialized with Planner + Executor Loop. Phase 15 (Collaborator) Active.');
  }

  /**
   * Conditional Edge: Route Plan
   * Decides whether to loop back to executor, reroute to planner for repair, or end.
   * Phase 13.2: Self-Correction Path
   */
  private routePlan(state: AgentState): string {
    const { plan, pendingAction } = state;

    // Phase 15: Pause execution if awaiting user approval
    if (pendingAction) {
      console.log('[Governor] Pending action awaiting approval. Pausing execution.');
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });
      return END;
    }

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
  private async process(input: string, context: any, prData: any, stateOverrides?: Partial<AgentState>) {
    // Emit "Thinking" Signal
    eventBus.emit({
      type: 'AGENT_THINKING',
      payload: { stage: 'started', message: 'Analyzing...', timestamp: Date.now() }
    });

    try {
      // Build initial state (with optional overrides for resumption)
      const initialState: AgentState = {
        messages: [{ role: 'user', content: input }],
        context,
        prData,
        ...stateOverrides
      };

      // Execute Graph
      const finalState = await this.workflow.invoke(initialState);

      // Phase 15.2: Capture state for resumption
      this.state = finalState;

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
   * Phase 15.2: Resolve Pending Action (Human-in-the-Loop Handshake)
   * Called when user approves or rejects a pending sensitive action.
   */
  public async resolvePendingAction(approved: boolean) {
    const state = this.state;
    if (!state?.pendingAction || !state?.plan) {
      console.warn('[Agent] No pending action to resolve.');
      return;
    }

    const { plan, pendingAction, context, prData, messages } = state;
    const lastUserMsg = messages[messages.length - 1]?.content || '';

    if (approved) {
      // === APPROVED: Execute the tool ===
      console.log(`[Agent] Executing approved tool: ${pendingAction.tool}`);

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Executing ${pendingAction.tool}...` }
      });

      let stepResult: string;
      try {
        stepResult = await this.executeTool(pendingAction.tool, pendingAction.args);
      } catch (err: any) {
        stepResult = `Error: ${err.message}`;
      }

      // Analyze result (replicate "The Judge" logic)
      const exitCodeMatch = stepResult.match(/\[Exit Code: (\d+)\]/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
      const isSuccess = exitCode === 0;

      // Update Plan
      const currentStep = plan.steps[plan.activeStepIndex];
      const newSteps = [...plan.steps];
      newSteps[plan.activeStepIndex] = {
        ...currentStep,
        status: isSuccess ? 'completed' : 'failed',
        result: stepResult
      };

      const nextIndex = isSuccess ? plan.activeStepIndex + 1 : plan.activeStepIndex;
      let nextStatus: typeof plan.status = isSuccess ? 'executing' : 'failed';

      // Check if plan is complete
      if (isSuccess && nextIndex >= plan.steps.length) {
        nextStatus = 'completed';
      }

      const nextPlan = {
        ...plan,
        steps: newSteps,
        activeStepIndex: nextIndex,
        status: nextStatus
      };

      // UX: Report result
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Step ${plan.activeStepIndex + 1}: ${stepResult.substring(0, 200)}` }
      });

      // Resume graph with updated state (clear pendingAction)
      await this.process(lastUserMsg, context, prData, {
        plan: nextPlan,
        pendingAction: undefined,
        lastError: isSuccess ? undefined : stepResult
      });

    } else {
      // === REJECTED: Mark step as failed, route to planner ===
      console.log('[Agent] Action Rejected by User.');

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: 'Action rejected. Finding alternative approach...' }
      });

      const newSteps = [...plan.steps];
      newSteps[plan.activeStepIndex] = {
        ...plan.steps[plan.activeStepIndex],
        status: 'failed',
        result: 'User rejected the action.'
      };

      const nextPlan = {
        ...plan,
        steps: newSteps,
        status: 'failed' as const
      };

      // Resume graph -> Will route to Planner (Repair Mode)
      await this.process(lastUserMsg, context, prData, {
        plan: nextPlan,
        pendingAction: undefined,
        lastError: 'User explicitly blocked this action.'
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

Available Tools:
- find_file: Use when you need to open a specific file (e.g., "Open the Agent class").
- search_text: Use when you need to find a Code Symbol (e.g., "Where is AgentState defined?").
- run_terminal_command: Use for general shell tasks (e.g., "npm install", "npm test").
- navigate_to_code: Use to navigate to a specific file and line number.
- change_tab: Use to switch sidebar tabs.

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

    let response;
    try {
      // 1. Create Execution Session
      console.log('[Executor] Creating chat session...');
      console.log('[Executor] Tools:', executorTools.map(t => t.name));

      const chat = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction: `You are Theia's Executor.
Your Goal: Complete the current step of the plan.
Plan Goal: "${plan.goal}"
Current Step (${plan.activeStepIndex + 1}/${plan.steps.length}): "${currentStep.description}"
Suggested Tool: ${currentStep.tool || 'Decide best tool'}
Context: ${context?.activeFile}

FORCE: You MUST call a tool. DO NOT reply with text.`,
          tools: [{ functionDeclarations: executorTools }]
        }
      });

      console.log('[Executor] Chat session created. Calling Gemini API...');

      // 2. Trigger the LLM with timeout protection
      const timeoutMs = 30000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`API call timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      response = await Promise.race([
        chat.sendMessage({ message: "EXECUTE_NOW" }),
        timeoutPromise
      ]) as any;
    } catch (error: any) {
      // SCENARIO A: API EXPLOSION (Quota, Net, Auth)
      console.error('[Executor] API Error:', error);

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `API Error: ${error.message}` }
      });
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });

      return {
        plan: {
          ...plan,
          status: 'failed' as const,
          // Mark current step as failed with the API error message
          steps: plan.steps.map((s, i) => i === plan.activeStepIndex ?
            { ...s, status: 'failed' as const, result: `API Error: ${error.message}` } : s)
        },
        lastError: `Critical API Failure: ${error.message}`
      };
    }

    // 3. ANALYZE RESPONSE
    const rawText = response?.text || '';
    const functionCalls = response?.functionCalls || [];
    const functionCall = functionCalls[0];

    console.log('[Executor Debug] Text:', rawText);
    console.log('[Executor Debug] Tool:', functionCall?.name);

    // SCENARIO B: MODEL HALLUCINATION (The "Chatty" Trap)
    if (!functionCall) {
      console.warn('[Executor] No tool call detected. Model chatted instead.');

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Executor failed: Model returned text instead of tool call` }
      });
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() }
      });

      return {
        plan: {
          ...plan,
          status: 'failed' as const,
          steps: plan.steps.map((s, i) => i === plan.activeStepIndex ?
            { ...s, status: 'failed' as const, result: `Error: Model returned text instead of tool: ${rawText.substring(0, 100)}` } : s)
        },
        lastError: `Executor Expectation Failed. Model said: ${rawText.substring(0, 200)}`
      };
    }

    // SCENARIO C: SUCCESS (Proceed to Gatekeeper)
    const { name, args } = functionCall;

    // --- GATEKEEPER LOGIC (Phase 15) ---
    if (SENSITIVE_TOOLS.includes(name)) {
      console.log(`[Gatekeeper] Intercepting sensitive tool: ${name}`);

      // Emit event to UI
      eventBus.emit({
        type: 'AGENT_REQUEST_APPROVAL',
        payload: { tool: name, args }
      });

      // PAUSE EXECUTION
      return {
        pendingAction: {
          tool: name,
          args,
          rationale: `Action requires user approval: ${currentStep.description}`
        }
      };
    }
    // -----------------------------------

    let stepResult = "No tool execution needed.";

    // 4. Execute Tool (if not sensitive or already approved)
    console.log(`[Executor] Calling ${name} with`, args);

    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: { text: `Running: ${name}` }
    });

    try {
      const output = await this.executeTool(name, args);
      stepResult = output;
    } catch (err: any) {
      stepResult = `Error: ${err.message}`;
    }

    // UX: Tell the user what we got
    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: { text: `Step ${plan.activeStepIndex + 1}: ${stepResult.substring(0, 200)}` }
    });

    // 5. Analyze Result (The Judge)
    const exitCodeMatch = stepResult.match(/\[Exit Code: (\d+)\]/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

    const isSuccess = exitCode === 0;
    const stepStatus: PlanStep['status'] = isSuccess ? 'completed' : 'failed';

    const newSteps = [...plan.steps];
    newSteps[plan.activeStepIndex] = {
      ...currentStep,
      status: stepStatus,
      result: stepResult
    };

    let nextStatus: AgentPlan['status'] = plan.status;
    let nextIndex = plan.activeStepIndex;

    if (isSuccess) {
      nextIndex++;
      if (nextIndex >= plan.steps.length) {
        nextStatus = 'completed';
      }
    } else {
      console.warn(`[Executor] Step ${plan.activeStepIndex + 1} Failed with Exit Code ${exitCode}. Stopping.`);
      nextStatus = 'failed';
    }

    const updatedPlan: AgentPlan = {
      ...plan,
      steps: newSteps,
      activeStepIndex: nextIndex,
      status: nextStatus
    };

    if (!isSuccess) {
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: `Step Failed: ${stepResult.substring(0, 200)}` }
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

    return {
      plan: updatedPlan,
      lastError: isSuccess ? undefined : stepResult // Capture error on failure
    };
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

    // 2. Knowledge Tools (The Librarian - Phase 14)

    // Layer 1 (Surface Search): find_file -> Uses MiniSearch (UI) to find filenames
    if (name === 'find_file') {
      // Map 'name' arg to 'query' for searchService
      const results = searchService.search(args.name);

      if (results.length === 0) {
        return "No files found with that name.";
      }

      return `Found files:\n` + results.map(r => `- ${r.id}`).join('\n');
    }

    // Layer 2 (Deep Search): search_text -> Uses Node.js (Runtime) to find code symbols
    // Note: WebContainer's jsh doesn't have grep, so we use a Node.js script instead
    if (name === 'search_text') {
      // Escape special characters for the search query
      const escapedQuery = args.query.replace(/['"\\]/g, '\\$&');

      // Node.js one-liner that recursively searches for text in files
      // Works in WebContainer where grep is not available
      const nodeScript = `
        const fs=require('fs'),path=require('path');
        const q='${escapedQuery}';
        function search(dir){
          try{
            fs.readdirSync(dir).forEach(f=>{
              const p=path.join(dir,f);
              try{
                const s=fs.statSync(p);
                if(s.isDirectory()&&!f.startsWith('.')&&f!=='node_modules')search(p);
                else if(s.isFile()&&/\\.(ts|js|tsx|jsx|json|md)$/.test(f)){
                  const lines=fs.readFileSync(p,'utf8').split('\\n');
                  lines.forEach((l,i)=>{if(l.includes(q))console.log(p+':'+(i+1)+': '+l.trim())});
                }
              }catch(e){}
            });
          }catch(e){}
        }
        search('.');
      `.replace(/\n/g, '');

      const command = `node -e "${nodeScript}"`;
      return this.executeCommandAndWait(command, []);
    }

    // Phase 15: write_file tool - Creates/overwrites files via Node.js
    if (name === 'write_file') {
      const escapedPath = args.path.replace(/'/g, "\\'");
      const escapedContent = args.content.replace(/'/g, "\\'").replace(/\n/g, '\\n');

      const nodeScript = `
        const fs=require('fs'),path=require('path');
        const targetPath='${escapedPath}';
        const content='${escapedContent}'.replace(/\\\\n/g,'\\n');
        const dir=path.dirname(targetPath);
        if(dir && dir!=='.' && !fs.existsSync(dir)){
          fs.mkdirSync(dir,{recursive:true});
        }
        fs.writeFileSync(targetPath,content);
        console.log('File written: '+targetPath);
      `.replace(/\n/g, '');

      const command = `node -e "${nodeScript}"`;
      return this.executeCommandAndWait(command, []);
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
