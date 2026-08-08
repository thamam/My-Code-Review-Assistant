/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Phase 15: The Collaborator - Human-in-the-Loop.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenAI, FunctionDeclaration, Type, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { eventBus } from "./EventBus";
import { AgentPlan, PlanStep } from "../planner/types";
import { storageService } from '../persistence';
import { ContextSnapshot } from "../../types/context";
import { buildModeSection } from "../../prompts/modeInstructions";
import { buildContextEnvelope } from "../../prompts/contextEnvelope";
import { buildSystemPrompt } from "../../prompts/systemPrompt";
import { getGenAI } from "./genaiClient";
import type { AgentState, PendingAction, ToolOutcome } from "./agent/types";
import { formatDualTrack, type DualTrackResponse } from "./agent/dualTrack";
import {
  uiTools,
  executorTools,
  SENSITIVE_TOOLS,
  isReadOnlyInvocation,
  dispatchTool,
  scoreToolOutcome,
  type ToolDispatchContext,
} from "./agent/toolRegistry";
import { parsePlanFromText, hasStepsArray } from "./agent/planJsonParser";

// --- Types (re-exported for existing consumers of "./Agent") ---
export type { AgentState, PendingAction, ToolOutcome, DualTrackResponse };

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

// Executor Tools (The Hands), Knowledge Tools (The Librarian), the Gatekeeper's
// SENSITIVE_TOOLS/isReadOnlyInvocation classification, and their dispatch
// implementations all now live together in ./agent/toolRegistry (Concern 1,
// Stage F) — imported above as uiTools/executorTools/SENSITIVE_TOOLS/isReadOnlyInvocation.

export class TheiaAgent {
  // Lazy: constructing GoogleGenAI eagerly throws when no API key is set,
  // and `agent` below is a module-scope singleton — an eager `this.ai =
  // getGenAI()` in the constructor would crash the whole module graph on
  // import (white screen) for anyone without VITE_GEMINI_API_KEY set.
  private _ai: GoogleGenAI | null = null;
  private get ai(): GoogleGenAI {
    if (!this._ai) this._ai = getGenAI();
    return this._ai;
  }
  private set ai(value: GoogleGenAI) {
    this._ai = value;
  }
  private model: string = 'gemini-3.1-pro-preview';
  private chatSession: any = null;
  private workflow: any;
  private state: AgentState | null = null; // Phase 15.2: Persisted state for resumption
  private lastUserInteraction: number = 0; // Phase 17: User Activity Tracker (FR-041/FR-042)
  private isBusy: boolean = false;

  constructor() {
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
        // Routing guard: absent engine ⇒ 'simple' (safe default), so only an
        // explicit 'agent' flag wakes this brain. If this guard is ever
        // dropped, both brains answer the same message. See SimpleChat.ts
        // for the mirror guard.
        const engine = event.payload.engine ?? 'simple';
        if (engine !== 'agent') {
          // Ordinary 'simple' traffic takes this path on every default-path
          // message — only warn when the value is neither known engine.
          if (engine !== 'simple') {
            console.warn(`[Agent] USER_MESSAGE rejected: unknown engine "${engine}".`);
          }
          return;
        }

        const { content, text, context, prData, model } = event.payload;
        console.log('[AGENT_PROBE] Raw Payload:', event.payload);

        const requestedModel = model || 'gemini-3.1-pro-preview';

        // Never mutate the shared `this.model` while a turn is in flight — planner/executor
        // nodes read it live on every step, so swapping it under a running turn would
        // silently change models mid-plan. Wait for the current turn to finish (it's
        // already serialized via isBusy), then apply the new model only for this turn.
        if (this.isBusy) {
          console.log('[Agent] Turn in flight; deferring model change until it completes.');
          await this.waitUntilIdle();
        }
        this.setModel(requestedModel);

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
   * Applies a model switch. Resets the lazily-created chat session whenever the model
   * actually changes — otherwise `reasoningNode` would keep reusing a session bound to
   * whichever model was active when it was first created.
   */
  private setModel(newModel: string): void {
    if (this.model !== newModel) {
      this.model = newModel;
      this.chatSession = null;
    }
  }

  /** Polls until the current turn (if any) finishes. */
  private async waitUntilIdle(): Promise<void> {
    while (this.isBusy) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  /**
   * Per-model generation config (e.g. extended thinking level for Pro).
   */
  private getModelConfig(functionTools?: FunctionDeclaration[]): Partial<GenerateContentConfig> {
    const config: Partial<GenerateContentConfig> = {};

    if (this.model === 'gemini-3.1-pro-preview') {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    if (functionTools) {
      config.tools = [{ functionDeclarations: functionTools }];
    }

    return config;
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

      // Execute the exact tool + arguments the user saw in the approval modal, and
      // score the outcome with the same Judge the executor uses.
      const outcome = await this.runTool(pendingAction.tool, pendingAction.args, prData);
      const stepResult = outcome.output;
      const isSuccess = outcome.ok;

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

      // UX: Report result (an approved action that failed must not read as a success)
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: {
          text: formatDualTrack(
            `Step ${plan.activeStepIndex + 1} ${isSuccess ? 'completed' : 'failed'}.`,
            `**Step ${plan.activeStepIndex + 1}${isSuccess ? '' : ' (Failed)'}:**\n${stepResult}`
          )
        }
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

CRITICAL: You will receive a [SYSTEM_CONTEXT] block. This is the GROUND TRUTH about the reviewer's current location.
- ACTIVE_FILE: the file currently open. "this file" always means this.
- VISIBLE_LINES: the line range currently on screen — use this when the user says "here", "this section", "what I'm looking at".
- FOCUSED_LINE: the exact line scrolled to — use this for "this line".
- SELECTED_CODE: code the user highlighted — use this for "this code", "this function", "explain this".
- VIEW_MODE: diff or source — line numbers differ between modes.
- [ACTIVE FILE CONTENT] block: the actual source of ACTIVE_FILE, when available — read code from here instead of guessing or asking the user to paste it.
NEVER guess filenames or line numbers. Use the context.

Context: File: ${context?.activeFile || 'None'}, Lines: ${context?.viewportStartLine ?? '?'}–${context?.viewportEndLine ?? '?'}, Repo: ${prData?.title || 'Unknown'}

${buildModeSection(context?.appMode ?? 'pr', context?.customReviewGoal)}`;

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
        ...this.getModelConfig(plannerTools)
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

      const parseOutcome = parsePlanFromText(text);
      if (parseOutcome.status === 'parsed') {
        if (parseOutcome.via === 'greedy') {
          console.warn('[Planner] Standard parse failed, attempting greedy search...');
        }
        planData = parseOutcome.data;
      } else if (parseOutcome.status === 'invalid-json') {
        console.warn('[Planner] Standard parse failed, attempting greedy search...');
        console.error('[Planner] Failed to parse Plan JSON even with greedy search.');
        // Fall back to just speaking the text
        if (text) {
          eventBus.emit({
            type: 'AGENT_SPEAK',
            payload: { text: formatDualTrack('I have a response for you.', text) }
          });
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

      // Validate and build plan if we successfully parsed the JSON
      if (hasStepsArray(planData)) {
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
            ...this.getModelConfig(executorTools)
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
    // Take the tool AND its arguments from the call the model was just forced to make.
    // The plan step is not a source of arguments: submit_plan's schema declares only
    // `description` and `tool`, so `currentStep.args` is structurally always undefined.
    // `currentStep.tool` remains a fallback for a call that arrives without a name.
    const name = functionCall.name || currentStep.tool;
    const args = (functionCall.args || {}) as Record<string, any>;

    if (!name) {
      console.warn('[Executor] Function call carried no tool name and the step suggested none.');
      return {
        plan: {
          ...plan,
          status: 'failed' as const,
          steps: plan.steps.map((s, i) => i === plan.activeStepIndex ?
            { ...s, status: 'failed' as const, result: 'Error: Tool call had no resolvable name.' } : s)
        },
        lastError: 'Executor received a function call with no tool name.'
      };
    }

    // Phase 15: The Gatekeeper - Sensitive tools require human approval
    // FR-011: Interception Logic
    // Optimization: Read-only commands are SAFE
    const isSensitive = SENSITIVE_TOOLS.includes(name) && !isReadOnlyInvocation(name, args);

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

    // 4. Execute Tool (if not sensitive or already approved)
    console.log(`[Executor] Calling ${name} with`, args);

    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: { text: formatDualTrack(`Running ${name}.`, `Running: \`${name}\``) }
    });

    const outcome = await this.runTool(name, args, prData);
    const stepResult = outcome.output;

    // UX: Tell the user what we got
    eventBus.emit({
      type: 'AGENT_SPEAK',
      payload: {
        text: formatDualTrack(`Step ${plan.activeStepIndex + 1} result received.`, `**Step ${plan.activeStepIndex + 1}:**\n${stepResult}`)
      }
    });

    // 5. Analyze Result (The Judge) — already scored structurally by runTool.
    const isSuccess = outcome.ok;
    const stepStatus: PlanStep['status'] = isSuccess ? 'completed' : 'failed';
    const failureReason = outcome.exitCode === null ? 'tool error' : `Exit Code: ${outcome.exitCode}`;

    if (!isSuccess) {
      console.log(`[Executor] Step failed (${failureReason}). Emitting tool_error.`);
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: {
          stage: 'tool_error',
          message: `Step failed (${failureReason}).`,
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
      console.warn(`[Executor] Step ${plan.activeStepIndex + 1} Failed (${failureReason}). Stopping.`);
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

    // Ensure message content is a valid non-empty string
    const messageContent = String(userMsg.content || '').trim();
    if (!messageContent) {
      console.error('[TheiaAgent] Empty message content');
      return { messages: [] };
    }

    // Context Injection — use canonical buildContextEnvelope (prevents double-injection)
    const envelopedMessage = this.buildContextEnvelope(messageContent, context);

    let response = await this.chatSession.sendMessage({ message: envelopedMessage });

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
   * Runs a tool and scores the outcome (The Judge).
   *
   * The score is structural, not textual. A tool that throws is a failure by
   * construction — it never reaches the exit-code parser, so it can no longer be
   * silently read as exit 0 and marked `completed`. Only a clean return is eligible
   * for success, and an explicit `[Exit Code: N]` marker downgrades it when N != 0.
   *
   * Deliberately calls `this.executeTool` (not the registry's `dispatchTool`
   * directly) so a test that does `vi.spyOn(inst, 'executeTool')` still
   * intercepts dispatch — see tests/unit/core/AgentExecutor.test.ts.
   */
  private async runTool(name: string, args: any, prData?: any): Promise<ToolOutcome> {
    let output: string;
    try {
      output = await this.executeTool(name, args, prData);
    } catch (err: any) {
      return { output: `Error: ${err?.message ?? String(err)}`, ok: false, exitCode: null };
    }
    return scoreToolOutcome(output);
  }

  /**
   * Execute a tool by name. Thin delegator to ./agent/toolRegistry's
   * dispatchTool — the schema+handler registry for all eight Executor tools
   * (Concern 1, Stage F). Kept as an instance method (rather than calling
   * dispatchTool directly from executorNode/resolvePendingAction) so it
   * remains spy-able in tests.
   */
  private async executeTool(name: string, args: any, prData?: any): Promise<string> {
    const ctx: ToolDispatchContext = {
      prData,
      lastUserInteraction: this.lastUserInteraction,
      fallbackPrData: this.state?.prData,
    };
    return dispatchTool(name, args, ctx);
  }

  /**
   * FR-039: Context Middleware — delegates to the shared prompt builder
   * (src/prompts/contextEnvelope.ts) so Agent and SimpleChat stay in sync.
   */
  private buildContextEnvelope(message: string, context: ContextSnapshot | null): string {
    return buildContextEnvelope(message, context);
  }

  private buildSystemPrompt(context: ContextSnapshot | null, prData: any): string {
    return buildSystemPrompt({ context, prData, engine: 'agent' });
  }
}

import { TraceService } from "./TraceService";
import { LocalFlightRecorder } from "./FlightRecorder";

export const agent = new TheiaAgent();

// --- Operation Glass Box: Activate Flight Recorder ---
const flightRecorder = LocalFlightRecorder.loadFromDisk();
new TraceService(agent, flightRecorder);
