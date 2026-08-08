/**
 * src/modules/core/Agent.ts
 * The Control Plane: LangGraph State Machine.
 * Phase 15: The Collaborator - Human-in-the-Loop.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenAI, FunctionDeclaration, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { eventBus } from "./EventBus";
import { storageService } from '../persistence';
import { ContextSnapshot } from "../../types/context";
import { buildContextEnvelope } from "../../prompts/contextEnvelope";
import { buildSystemPrompt } from "../../prompts/systemPrompt";
import { getGenAI } from "./genaiClient";
import type { AgentState, PendingAction, ToolOutcome } from "./agent/types";
import { formatDualTrack, type DualTrackResponse } from "./agent/dualTrack";
import { uiTools, dispatchTool, scoreToolOutcome, type ToolDispatchContext } from "./agent/toolRegistry";
import { runPlannerNode } from "./agent/plannerNode";
import { runExecutorNode } from "./agent/executorNode";

// --- Types (re-exported for existing consumers of "./Agent") ---
export type { AgentState, PendingAction, ToolOutcome, DualTrackResponse };

// The Planner (submit_plan tool + plan-recovery JSON parsing) and the
// Executor (the eight-tool loop + Gatekeeper) now live in
// ./agent/plannerNode.ts and ./agent/executorNode.ts respectively
// (Concern 3, Stage F) — TheiaAgent.plannerNode/executorNode below are thin
// delegators. `uiTools` (imported above) is still needed here directly —
// it's used by the disconnected `reasoningNode` further down, which was
// out of scope for this decomposition (see Stage F report).

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
   * Node: Planner (The "Architect" - Phase 12.2 + Phase 13.2 Repair Mode).
   * Thin delegator to ./agent/plannerNode (Concern 3, Stage F) — assembles
   * the small PlannerRuntime contract (ai/model/getModelConfig) from this
   * instance's own state and hands off. The Planner and Executor share
   * nothing else; see plannerNode.ts's file comment.
   */
  private async plannerNode(state: AgentState) {
    return runPlannerNode(state, {
      ai: this.ai,
      model: this.model,
      getModelConfig: this.getModelConfig.bind(this),
    });
  }

  /**
   * Node: Executor. Thin delegator to ./agent/executorNode (Concern 3,
   * Stage F) — assembles the small ExecutorRuntime contract
   * (ai/model/getModelConfig/runTool) from this instance's own state and
   * hands off. `runTool` is `this.runTool` (not the registry's dispatch
   * directly) so `vi.spyOn(inst, 'executeTool')` in
   * tests/unit/core/AgentExecutor.test.ts keeps intercepting dispatch.
   */
  private async executorNode(state: AgentState) {
    return runExecutorNode(state, {
      ai: this.ai,
      model: this.model,
      getModelConfig: this.getModelConfig.bind(this),
      runTool: this.runTool.bind(this),
    });
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
