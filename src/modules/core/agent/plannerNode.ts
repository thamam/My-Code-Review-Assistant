/**
 * src/modules/core/agent/plannerNode.ts
 *
 * Concern 3 (Stage F decomposition): the Planner half of the Planner ->
 * Executor loop, extracted from Agent.ts so it can be read and tested on
 * its own. The Planner and the Executor (./executorNode.ts) share nothing
 * but the plan object (`AgentPlan`, from ../../planner/types) passed
 * through `AgentState.plan` — that's the explicit contract between them.
 * Everything else each node needs (the Gemini client, the active model,
 * per-model generation config) comes in through the small `PlannerRuntime`
 * parameter, which TheiaAgent.plannerNode assembles from its own instance
 * state before calling in.
 *
 * `submit_plan` is the Planner's own tool — the function-call schema that
 * forces structured plan output. It is deliberately NOT part of
 * ./toolRegistry.ts (Concern 1): unlike the Executor's eight tools, it is
 * never dispatched through executeTool/runTool — this node parses it
 * directly out of the model's function-call response below.
 */
import type { FunctionDeclaration, GoogleGenAI, GenerateContentConfig } from "@google/genai";
import { Type } from "@google/genai";
import { eventBus } from "../EventBus";
import { AgentPlan, PlanStep } from "../../planner/types";
import { buildModeSection } from "../../../prompts/modeInstructions";
import { formatDualTrack } from "./dualTrack";
import { parsePlanFromText, hasStepsArray } from "./planJsonParser";
import type { AgentState } from "./types";

// --- Planner Tool (Forces Structured Output) ---
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

/** What the Planner needs from TheiaAgent to talk to the model. */
export interface PlannerRuntime {
  ai: GoogleGenAI;
  model: string;
  getModelConfig: (functionTools?: FunctionDeclaration[]) => Partial<GenerateContentConfig>;
}

/**
 * Node: Planner (The "Architect" - Phase 12.2 + Phase 13.2 Repair Mode)
 * Analyzes user request and creates a step-by-step plan.
 * In REPAIR MODE: Generates a fix-oriented plan based on the last error.
 */
export async function runPlannerNode(state: AgentState, runtime: PlannerRuntime): Promise<Partial<AgentState>> {
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
  const response = await runtime.ai.models.generateContent({
    model: runtime.model,
    config: {
      systemInstruction,
      ...runtime.getModelConfig(plannerTools)
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
