/**
 * src/modules/core/agent/executorNode.ts
 *
 * Concern 3 (Stage F decomposition): the Executor half of the Planner ->
 * Executor loop, extracted from Agent.ts. See ./plannerNode.ts's file
 * comment for the shared-contract note: the Planner and Executor share
 * nothing but the plan object (`AgentPlan`, from ../../planner/types),
 * carried through `AgentState.plan`. Everything else the Executor needs —
 * the Gemini client, the active model, per-model generation config, and the
 * tool-execution Judge (`runTool`) — arrives through the small
 * `ExecutorRuntime` parameter that TheiaAgent.executorNode assembles.
 *
 * `runTool` is injected (rather than this module importing
 * ./toolRegistry's dispatchTool/scoreToolOutcome directly) so that
 * `vi.spyOn(agentInstance, 'executeTool')` in
 * tests/unit/core/AgentExecutor.test.ts keeps intercepting dispatch —
 * TheiaAgent.runTool still calls `this.executeTool` internally. See
 * Agent.ts's runTool/executeTool for that wiring.
 */
import type { FunctionDeclaration, GoogleGenAI, GenerateContentConfig } from "@google/genai";
import { eventBus } from "../EventBus";
import { AgentPlan, PlanStep } from "../../planner/types";
import { formatDualTrack } from "./dualTrack";
import { executorTools, SENSITIVE_TOOLS, isReadOnlyInvocation } from "./toolRegistry";
import type { AgentState, ToolOutcome } from "./types";

/** What the Executor needs from TheiaAgent to talk to the model and run tools. */
export interface ExecutorRuntime {
  ai: GoogleGenAI;
  model: string;
  getModelConfig: (functionTools?: FunctionDeclaration[]) => Partial<GenerateContentConfig>;
  /** The Judge: runs a tool and scores its outcome structurally. */
  runTool: (name: string, args: any, prData?: any) => Promise<ToolOutcome>;
}

/**
 * Node: Executor
 * Takes the current step from the plan and executes it.
 */
export async function runExecutorNode(state: AgentState, runtime: ExecutorRuntime): Promise<Partial<AgentState>> {
  console.log('[Agent] Executing Step...');
  const { plan, context, prData } = state;

  // Safety check
  if (!plan || plan.activeStepIndex >= plan.steps.length) {
    return { plan: { ...plan, status: 'completed' } as AgentPlan };
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
      runtime.ai.models.generateContent({
        model: runtime.model,
        config: {
          systemInstruction: `You are Theia's Executor.
Your Goal: Complete the current step of the plan.
Plan Goal: "${plan.goal}"
Current Step (${plan.activeStepIndex + 1}/${plan.steps.length}): "${currentStep.description}"
Suggested Tool: ${currentStep.tool || 'Decide best tool'}
Context: ${context?.activeFile}

FORCE: You MUST call a tool. DO NOT reply with text.
PRIORITY: Always prefer specialized tools (search_text, find_file, navigate_to_code) over run_terminal_command when possible.`,
          ...runtime.getModelConfig(executorTools)
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

  const outcome = await runtime.runTool(name, args, prData);
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
