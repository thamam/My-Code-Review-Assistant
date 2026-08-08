/**
 * src/modules/core/agent/types.ts
 * Shared data shapes for the Agent control plane and its extracted pieces
 * (tool registry, planner node, executor node). Extracted from Agent.ts
 * (Stage F) so the tool registry and node modules don't have to import
 * from Agent.ts itself (which would create a cycle back into the class
 * that owns the LangGraph wiring).
 */
import { ContextSnapshot } from "../../../types/context";
import { AgentPlan } from "../../planner/types";

// Phase 15: Define the structure of an action waiting for approval
export interface PendingAction {
  tool: string;
  args: any;
  rationale: string; // "I need to edit this file to fix the bug..."
}

/**
 * The Judge's verdict for one tool invocation.
 * Success is decided structurally, not by sniffing the output string: a tool that
 * throws can never be scored as exit 0.
 */
export interface ToolOutcome {
  /** Human-readable output — shown to the user and fed back to the Planner on repair. */
  output: string;
  /** True only when the tool returned without throwing and reported no non-zero exit code. */
  ok: boolean;
  /** Exit code from an `[Exit Code: N]` marker; null when the tool threw or emitted no marker. */
  exitCode: number | null;
}

export interface AgentState {
  messages: { role: string; content: string }[];
  context: ContextSnapshot | null; // The UserContextState passed from UI
  prData: any;  // PR metadata
  plan?: AgentPlan; // The Cortex - Deliberative Reasoning
  lastError?: string; // Phase 13: The reason for failure (Trauma Memory)
  pendingAction?: PendingAction; // Phase 15: The "Held" action awaiting approval
}
