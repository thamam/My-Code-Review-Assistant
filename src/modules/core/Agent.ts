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
import { storageService } from '../persistence';
import { sanitizeForVoice } from "../../utils/VoiceUtils";
import { formatSearchCommand, formatWriteFileCommand } from "../runtime/ToolUtils";
import { DiagramAgent } from "../../../services/diagramAgent";

// --- Types ---

// Phase 15: Define the structure of an action waiting for approval
export interface PendingAction {
  tool: string;
  args: any;
  rationale: string; // "I need to edit this file to fix the bug..."
}

export interface AgentState {
  messages: { role: string; content: string }[];
  context: any; // The UserContextState passed from UI
  prData: any;  // PR metadata
  plan?: AgentPlan; // The Cortex - Deliberative Reasoning
  lastError?: string; // Phase 13: The reason for failure (Trauma Memory)
  pendingAction?: PendingAction; // Phase 15: The "Held" action awaiting approval
}

// --- FR-038: Dual-Track Protocol (Voice-First) ---
// The "News Anchor" pattern: voice track for TTS, screen track for UI
export interface DualTrackResponse {
  voice: string;  // Spoken summary - NO code, NO markdown, natural English only
  screen: string; // Visual detail - Markdown, Code, Mermaid diagrams
}

/**
 * Helper: Formats a message into Dual-Track JSON format.
 * Voice track is sanitized for TTS (no code, no special chars).
 * Screen track retains full markdown/code formatting.
 */
function formatDualTrack(voice: string, screen?: string): string {
  const cleanVoice = sanitizeForVoice(voice).substring(0, 200); // Max 2 sentences (~200 chars)

  const response: DualTrackResponse = {
    voice: cleanVoice || 'Action completed.',
    screen: screen || voice
  };
  return JSON.stringify(response);
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
  },
  // Tool 3: Diagram Generation (Phase 8)
  {
    name: "propose_diagrams",
    description: "Generate high-value Mermaid.js diagrams for the current PR or codebase. Use this when the user asks for architecture, flow, or visualization.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Specific instructions for the diagram (optional)" }
      }
    }
  }
];

// Combined Tools for Executor (The Full Toolset)
const executorTools = [...uiTools, ...knowledgeTools];

// Phase 15: The Gatekeeper - Sensitive tools require human approval
const SENSITIVE_TOOLS = ['run_terminal_command', 'write_file'];

export class TheiaAgent {
  private ai: GoogleGenAI;
  private model: string = 'gemini-3-pro-preview';
  private chatSession: any = null;
  private workflow: any;
  private unsubscribeTemp: (() => void) | null = null;
  private state: AgentState | null = null; // Phase 15.2: Persisted state for resumption
  private lastUserInteraction: number = 0; // Phase 17: User Activity Tracker (FR-041/FR-042)
  private isBusy: boolean = false;

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
    (graph as any).addConditionalEdges(
      START,
      this.routeEntry.bind(this),
      {
        planner: "planner",
        executor: "executor",
        [END]: END
      }
    );

    (graph as any).addEdge("planner", "executor");

    // The Loop: Executor decides whether to repeat, replan, or finish
    (graph as any).addConditionalEdges(
      "executor",
      this.routePlan.bind(this),
      {
        executor: "executor",
        planner: "planner", 
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
        console.log('[AGENT_PROBE] Raw Payload:', event.payload);

        // FR-039: Context Middleware - Inject "Ground Truth"
        const rawMessage = content || text || '';
        const envelopedMessage = this.buildContextEnvelope(rawMessage, context);
        await this.process(envelopedMessage, context, prData);
      }
    });

    // Phase 15.2: Subscribe to User Approval events
    eventBus.subscribe('USER_APPROVAL', async (envelope) => {
      const event = envelope.event;
      if (event.type === 'USER_APPROVAL') {
        console.log(`[Agent] Received USER_APPROVAL: approved=${event.payload.approved}`);
        await this.resolvePendingAction(event.payload.approved);
      }
    });

    // Phase 17: User Activity Tracking (FR-041/FR-042)
    eventBus.subscribe('USER_ACTIVITY', (envelope) => {
      const event = envelope.event;
      if (event.type === 'USER_ACTIVITY') {
        this.lastUserInteraction = event.payload.timestamp;
        
        // FR-041: Proactive Barge-In
        if (this.isBusy) {
          console.log('[Barge-In] User activity detected while busy. Preparing to yield.');
          eventBus.emit({
            type: 'AGENT_YIELD',
            payload: { reason: 'user_activity', timestamp: Date.now() }
          });
        }
      }
    });

    console.log('[TheiaAgent] Initialized with Planner + Executor Loop. Phase 17 (Shadow Partner) Active.');
  }

  /**
   * Phase 12.5: State Exposure (Operation Glass Box)
   * Returns a snapshot of the current Agent state.
   */
  public getState(): AgentState | null {
    return this.state;
  }

  /**
   * Entry Router: Decides where to start the graph
   */
  private routeEntry(state: AgentState): string {
    const { plan, pendingAction } = state;

    // 1. If we are waiting for human approval, STOP and END the graph iteration.
    // The graph will be restarted via this.process() when USER_APPROVAL is received.
    if (pendingAction) {
      console.log('[EntryRouter] Pending action detected. Stopping graph.');
      return END;
    }

    // 2. If we have an existing plan that is still executing, go straight to executor.
    if (plan && plan.status === 'executing') {
      console.log('[EntryRouter] Resuming existing plan.');
      return 'executor';
    }

    // 3. Default: Need to create a new plan
    console.log('[EntryRouter] Routing to planner.');
    return 'planner';
  }

  /**
   * Conditional Edge: Route Plan
   * Decides whether to loop back to executor, reroute to planner for repair, or end.
   * Phase 13.2: Self-Correction Path
   */
  private routePlan(state: AgentState): string {
    const { plan, pendingAction } = state;

    // FR-041: Barge-In Detection - Yield control if user became active recently
    if (Date.now() - this.lastUserInteraction < 1000) {
      console.log('[Governor] Barge-in detected. Yielding control.');
      eventBus.emit({
        type: 'AGENT_YIELD',
        payload: { reason: 'user_activity', timestamp: Date.now() }
      });
      return END;
    }

    // Phase 15: Pause execution if awaiting user approval
    if (pendingAction) {
      console.log('[Governor] Pending action awaiting approval. Pausing execution.');
      return END;
    }

    // Safety Rail (The Governor): Prevent infinite loops
    if (plan && plan.activeStepIndex > 15) {
      console.warn('[Governor] Max steps exceeded. Aborting.');
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: formatDualTrack('Safety limit reached. Maximum steps exceeded.', 'Safety limit reached: Maximum steps exceeded. Stopping execution.') }
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
    this.isBusy = true;
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

      // Phase 16: PERSIST STATE TO LOCALSTORAGE
      storageService.saveState(this.state);

    } catch (error: any) {
      console.error("[Agent] Graph Execution Failed:", error);
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: formatDualTrack('A system error occurred.', `System Error: ${error.message}`) }
      });
    } finally {
      this.isBusy = false;
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
        payload: { text: formatDualTrack('Executing the approved action now.', `Executing \`${pendingAction.tool}\`...`) }
      });

      let stepResult: string;
      try {
        stepResult = await this.executeTool(pendingAction.tool, pendingAction.args, prData);
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
        payload: { text: formatDualTrack(`Step ${plan.activeStepIndex + 1} completed.`, `**Step ${plan.activeStepIndex + 1}:**\n${stepResult}`) }
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
        payload: { text: formatDualTrack('Action rejected. Finding an alternative approach.', 'Action rejected. Finding alternative approach...') }
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
   * Phase 16.2: Load Session (The Resurrection)
   * Attempts to restore the Agent's state from localStorage.
   * Emits AGENT_SESSION_RESTORED to notify UI to repaint.
   */
  public async loadSession() {
    console.log('[Agent] Attempting to restore session...');
    const saved = storageService.loadState();

    if (saved) {
      // 1. Restore Internal State
      this.state = saved as AgentState;

      // 2. Notify the UI to repaint
      // We send the whole state so the UI can populate messages, plan, and pending actions
      eventBus.emit({
        type: 'AGENT_SESSION_RESTORED',
        payload: { state: this.state }
      });

      console.log(`[Agent] Session restored. ${this.state.messages?.length || 0} messages recovered.`);

      // 3. Resume Pending Actions (Optional Polish)
      // If we were paused waiting for approval, we just leave it in 'pendingAction'
      // The UI will see it and re-render the modal automatically.
    } else {
      console.log('[Agent] No saved session found. Starting fresh.');
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

CRITICAL: You will receive a [SYSTEM_CONTEXT] block. This is the GROUND TRUTH.
If User says 'this file', refer to ACTIVE_FILE.
NEVER guess filenames. Use the context.

Context: File: ${context?.activeFile}, Repo: ${prData?.title}`;

    let prompt = userMsg.content;

    // INJECT REPAIR CONTEXT (FR-009: Improved Repair Mode)
    if (isRepairMode) {
      console.log('[Planner] Entering REPAIR MODE.');

      eventBus.emit({
        type: 'REPAIR_MODE',
        payload: { originalGoal: plan.goal, lastError, timestamp: Date.now() }
      });

      // Extract failed step details for context
      const failedStep = plan.steps[plan.activeStepIndex];
      const failedTool = failedStep?.tool || 'Unknown';
      const failedDescription = failedStep?.description || 'Unknown';

      systemInstruction += `

╔══════════════════════════════════════════════════════════════╗
║                    🔴 REPAIR MODE ACTIVE 🔴                    ║
╚══════════════════════════════════════════════════════════════╝

The previous plan FAILED and you must create a RECOVERY PLAN.

━━━━━━━━━━━━━━━━━━ FAILURE ANALYSIS ━━━━━━━━━━━━━━━━━━
Failed Step: "${failedDescription}"
Failed Tool: ${failedTool}
Error Output:
"""
${lastError}
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ CRITICAL CONSTRAINTS:
1. You MUST NOT repeat the exact same tool with the same arguments that caused the error.
2. You MUST analyze WHY the step failed before attempting a fix.
3. The first step of your new plan MUST be a DIAGNOSTIC action.

💡 RECOVERY STRATEGIES:
- If "File Not Found": Use \`run_terminal_command\` with "ls -la" or "ls -R" to discover actual file paths.
- If "Command Failed": Check if required dependencies exist first (e.g., "npm install").
- If "Permission Denied": Try an alternative approach or report the limitation.
- If "Timeout": Break the operation into smaller steps.

YOUR MISSION:
1. Analyze the error message above.
2. Identify the root cause (wrong path? missing file? syntax error?).
3. Create a NEW plan with diagnostic/fix steps FIRST.
4. Achieve the original goal: "${plan.goal}"`;

      // Override the prompt to focus the LLM on the fix
      prompt = `REPAIR REQUIRED: The previous plan failed.

Original Goal: "${plan.goal}"
Failed Step: "${failedDescription}"
Error: ${lastError}

Create a RECOVERY PLAN that:
1. First diagnoses the issue (e.g., list files to find correct paths)
2. Then attempts to achieve the goal using a DIFFERENT strategy`;
    }

    // 1. Ask for the Plan using models.generateContent (standard project pattern)
    const response = await this.ai.models.generateContent({
      model: this.model,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: plannerTools }]
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    if (!response) {
      console.error('[Planner] No response received from model');
      return { plan: undefined, lastError: 'No response from AI model' };
    }

    // 3. Extract the Plan (Function Call)
    // Check all parts for a function call named 'submit_plan'
    let submitPlanCall = null;
    const parts = response.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      if (part.functionCall && part.functionCall.name === 'submit_plan') {
        submitPlanCall = part.functionCall;
        break;
      }
    }

    let newPlan: AgentPlan | undefined;

    if (submitPlanCall) {
      const args = submitPlanCall.args as any;
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
        payload: { text: formatDualTrack(speakText, `**Plan Created:** ${newPlan.goal}\n\n**Steps:** ${newPlan.steps.length}`) }
      });

      console.log('[Agent] Plan created:', newPlan);
    } else {
      // LLM returned text instead of a plan - attempt "Greedy" parse
      let text = '';
      for (const part of parts) {
        if (part.text) text += part.text;
      }
      console.log('[Planner] Raw Output:', text); // Log this to see what the model actually said

      let planData: any;

      try {
        // STRATEGY 1: Clean Markdown wrappers
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        planData = JSON.parse(cleanText);
      } catch (e) {
        // STRATEGY 2: "Greedy" Regex Search (Find the largest JSON object)
        console.warn('[Planner] Standard parse failed, attempting greedy search...');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            planData = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error('[Planner] Failed to parse Plan JSON even with greedy search.');
            // Fall back to just speaking the text
            if (text) {
              eventBus.emit({
                type: 'AGENT_SPEAK',
                payload: { text: formatDualTrack('I have a response for you.', text) }
              });
            }
          }
        } else {
          console.error('[Planner] No JSON object found in response.');
          if (text) {
            eventBus.emit({
              type: 'AGENT_SPEAK',
              payload: { text: formatDualTrack('I have a response for you.', text) }
            });
          }
        }
      }

      // Validate and build plan if we successfully parsed the JSON
      if (planData && planData.steps && Array.isArray(planData.steps)) {
        console.log('[Planner] Greedy parse succeeded! Building plan from raw text.');
        newPlan = {
          id: `plan-${Date.now()}`,
          goal: planData.goal || 'User Request',
          steps: planData.steps.map((s: any, i: number): PlanStep => ({
            id: `step-${i}`,
            description: s.description,
            tool: s.tool,
            status: 'pending'
          })),
          activeStepIndex: 0,
          status: 'executing',
          generatedAt: Date.now()
        };

        // Broadcast the thought
        eventBus.emit({
          type: 'AGENT_PLAN_CREATED',
          payload: { plan: newPlan }
        });

        eventBus.emit({
          type: 'AGENT_SPEAK',
          payload: { text: formatDualTrack(`I have created a plan with ${newPlan.steps.length} steps.`, `**Plan Created:** ${newPlan.goal}\n\n**Steps:** ${newPlan.steps.length}`) }
        });

        console.log('[Agent] Plan created via greedy parse:', newPlan);
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
      // 1. Create Execution Session using models.generateContent (standard project pattern)
      console.log('[Executor] Calling Gemini API for tool selection...');
      
      const timeoutMs = 30000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`API call timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      response = await Promise.race([
        this.ai.models.generateContent({
          model: this.model,
          config: {
            systemInstruction: `You are Theia's Executor.
Your Goal: Complete the current step of the plan.
Plan Goal: "${plan.goal}"
Current Step (${plan.activeStepIndex + 1}/${plan.steps.length}): "${currentStep.description}"
Suggested Tool: ${currentStep.tool || 'Decide best tool'}
Context: ${context?.activeFile}

FORCE: You MUST call a tool. DO NOT reply with text.
PRIORITY: Always prefer specialized tools (search_text, find_file, navigate_to_code) over run_terminal_command when possible.`,
            tools: [{ functionDeclarations: executorTools }]
          },
          contents: [{ role: 'user', parts: [{ text: "EXECUTE_NOW" }] }]
        }),
        timeoutPromise
      ]) as any;
    } catch (error: any) {
      // SCENARIO A: API EXPLOSION (Quota, Net, Auth)
      console.error('[Executor] API Error:', error);

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: formatDualTrack('An API error occurred.', `**API Error:** ${error.message}`) }
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

    if (!response) {
      console.error('[Executor] No response received from model');
      return { 
        plan: { ...plan, status: 'failed' as const }, 
        lastError: 'No response from AI model during execution' 
      };
    }

    // 3. ANALYZE RESPONSE
    const parts = response.candidates?.[0]?.content?.parts || [];
    let functionCall = null;
    let rawText = '';

    for (const part of parts) {
      if (part.functionCall) {
        functionCall = part.functionCall;
      }
      if (part.text) {
        rawText += part.text;
      }
    }

    console.log('[Executor Debug] Raw Model Text:', rawText);
    if (functionCall) {
      console.log('[Executor Debug] Tool Detected:', functionCall.name, 'Args:', JSON.stringify(functionCall.args));
    } else {
      console.warn('[Executor Debug] NO TOOL CALL DETECTED. Model outputted text instead.');
    }

    // SCENARIO B: MODEL HALLUCINATION (The "Chatty" Trap)
    if (!functionCall) {
      console.warn('[Executor] No tool call detected. Model chatted instead.');

      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: formatDualTrack('The executor encountered an issue.', 'Executor failed: Model returned text instead of tool call') }
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
    const name = currentStep.tool;
    const args = currentStep.args || {};

    // Phase 15: The Gatekeeper - Sensitive tools require human approval
    // FR-011: Interception Logic
    // Optimization: Read-only commands are SAFE
    const isReadOnlyCommand = name === 'run_terminal_command' && 
      (args.command === 'ls' || args.command === 'find' || args.command === 'grep' || args.command === 'cat');
    
    const isSensitive = SENSITIVE_TOOLS.includes(name) && !isReadOnlyCommand;

    if (isSensitive) {
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
      payload: { text: formatDualTrack(`Running ${name}.`, `Running: \`${name}\``) }
    });

    try {
      const output = await this.executeTool(name, args, prData);
      stepResult = output;
    } catch (err: any) {
      stepResult = `Error: ${err.message}`;
    }

    // UX: Tell the user what we got
    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: { text: formatDualTrack(`Step ${plan.activeStepIndex + 1} result received.`, `**Step ${plan.activeStepIndex + 1}:**\n${stepResult}`) }
    });

    // 5. Analyze Result (The Judge)
    const exitCodeMatch = stepResult.match(/\[Exit Code: (\d+)\]/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

    const isSuccess = exitCode === 0;
    const stepStatus: PlanStep['status'] = isSuccess ? 'completed' : 'failed';

    if (!isSuccess) {
      console.log(`[Executor] Step failed with exit code ${exitCode}. Emitting tool_error.`);
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { 
          stage: 'tool_error', 
          message: `Step failed (Exit Code: ${exitCode}).`, 
          timestamp: Date.now(),
          error: stepResult 
        }
      });
    }

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
        type: 'AGENT_THINKING',
        payload: { stage: 'tool_error', message: 'Step failed. Analyzing error...', timestamp: Date.now(), error: stepResult }
      });
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: { text: formatDualTrack('This step failed.', `**Step Failed:**\n${stepResult}`) }
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
          payload: { text: formatDualTrack('The plan has been completed successfully.', `**Plan Completed:** ${plan.goal}`) }
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

      // FR-041: Barge-In Detection - Yield control if user becomes active
      if (Date.now() - this.lastUserInteraction < 1000) {
        console.log('[Barge-In] User became active. Yielding control.');
        eventBus.emit({
          type: 'AGENT_THINKING',
          payload: { stage: 'completed', message: 'Paused: User activity detected', timestamp: Date.now() }
        });
        break; // Exit loop early, let user take over
      }

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
        this.executeTool(fc.name, fc.args, prData);

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
        payload: { text: formatDualTrack(text, text) }
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
    const TIMEOUT_MS = 15000; // 15s timeout for any shell command

    return new Promise((resolve) => {
      let outputBuffer = '';
      let timer: any;

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
        clearTimeout(timer);
      };

      // Subscribe to EventBus (using wildcard to catch all events)
      const unsubOutput = eventBus.subscribe('RUNTIME_OUTPUT', onOutput);
      const unsubExit = eventBus.subscribe('RUNTIME_EXIT', onExit);

      this.unsubscribeTemp = () => {
        unsubOutput();
        unsubExit();
      };

      // Safety Timeout
      timer = setTimeout(() => {
        console.warn(`[Agent] Command timed out: ${command} ${args.join(' ')}`);
        cleanup();
        resolve(outputBuffer + `\n[Error: Command timed out after ${TIMEOUT_MS}ms]`);
      }, TIMEOUT_MS);

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
  private async executeTool(name: string, args: any, prData?: any): Promise<string> {
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
    if (name === 'search_text') {
      const nodeScript = formatSearchCommand(args.query);
      return this.executeCommandAndWait('node', ['-e', nodeScript]);
    }

    // Tool 3: Diagram Generation (Phase 8)
    if (name === 'propose_diagrams') {
      const diagramAgent = new DiagramAgent();
      try {
        const targetPR = prData || this.state?.prData;
        if (!targetPR) return "Error: No PR data available for diagram generation.";
        
        let diagrams = [];
        if (args.prompt) {
          const custom = await diagramAgent.generateCustomDiagram(targetPR, args.prompt);
          diagrams = [custom];
        } else {
          diagrams = await diagramAgent.proposeDiagrams(targetPR);
        }

        const mermaidBlocks = diagrams.map(d => `### ${d.title}\n${d.description}\n\n\`\`\`mermaid\n${d.mermaidCode}\n\`\`\``).join('\n\n');
        return `Generated ${diagrams.length} diagrams:\n\n${mermaidBlocks}`;
      } catch (e: any) {
        return `Diagram generation failed: ${e.message}`;
      }
    }

    // Phase 15: write_file tool - Creates/overwrites files via Node.js
    if (name === 'write_file') {
      const nodeScript = formatWriteFileCommand(args.path, args.content);
      return this.executeCommandAndWait('node', ['-e', nodeScript]);
    }

    // 2. UI Tools (Sync/Fire-and-Forget)
    switch (name) {
      case 'navigate_to_code':
        // FR-042: Focus Lock - Don't steal focus if user was active in last 3 seconds
        if (Date.now() - this.lastUserInteraction < 3000) {
          console.log('[Focus Lock] Navigation skipped - user is active');
          return 'Navigation skipped (Focus Locked by User)';
        }
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

  /**
   * FR-039: Context Middleware - Constructs the "Ground Truth" envelope
   * This ensures the Agent always knows the user's active context.
   */
  private buildContextEnvelope(message: string, context: any): string {
    const activeFile = context?.activeFile || 'None';
    const activeTab = context?.activeTab || 'files';
    const selection = context?.activeSelection ? `\nACTIVE_SELECTION: ${context.activeSelection}` : '';

    const warning = activeFile === 'None' 
      ? '\nWARNING: No active file detected. If the user asks about "this file", ASK THEM to open it first. DO NOT GUESS filenames.' 
      : '';

    const contextHeader = context ? `
[SYSTEM_CONTEXT]
ACTIVE_FILE: ${activeFile}
ACTIVE_TAB: ${activeTab}${selection}${warning}
[/SYSTEM_CONTEXT]
` : '';

    console.log('[MIDDLEWARE_PROBE] Final Prompt Injection:', contextHeader);

    return `${contextHeader}

USER_QUERY: ${message}`;
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

import { TraceService } from "./TraceService";
import { LocalFlightRecorder } from "./FlightRecorder";

export const agent = new TheiaAgent();

// --- Operation Glass Box: Activate Flight Recorder ---
const flightRecorder = LocalFlightRecorder.loadFromDisk();
new TraceService(agent, flightRecorder);
