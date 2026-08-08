/**
 * Review-intent mode instructions.
 * Single source of truth for what each AppMode means, shared by Agent.ts
 * (system + planner prompts) and DirectorService.ts (voice brief prompt).
 */
import { AppMode } from '../types/domain';

interface ModeInstruction {
  label: string;
  goal: string;
  focus: string;
  constraints?: string;
}

const MODE_INSTRUCTIONS: Record<AppMode, ModeInstruction> = {
  pr: {
    label: 'PR REVIEW',
    goal: 'Review the changes in this Pull Request.',
    focus: 'Critical changes, potential bugs, architectural impact of the diff.',
  },
  learn: {
    label: 'LEARN THE CODE BASE',
    goal: 'Act as a Staff Engineer explaining the codebase to a new hire.',
    focus: 'High-level architecture, module interaction, file organization, and key patterns.',
    constraints: 'Do NOT focus on line-by-line diffs unless asked. Use the file manifest to infer project structure.',
  },
  dive: {
    label: 'CODE DIVE',
    goal: 'Deep technical analysis of the active file or specific area.',
    focus: 'Interface inward. Explain internal logic, state management, data flow, and side effects of the specific file in context.',
    constraints: 'Ignore unrelated parts of the codebase. Assume the user wants to master this specific module.',
  },
  custom: {
    label: 'CUSTOM REVIEW',
    goal: 'General Review',
    focus: "Strictly analyze code based on the user's stated goal above.",
    constraints: 'Ignore general style nits or unrelated issues unless they are critical bugs.',
  },
};

function resolveGoal(mode: AppMode, customReviewGoal?: string | null): string {
  if (mode === 'custom' && customReviewGoal?.trim()) return customReviewGoal.trim();
  return MODE_INSTRUCTIONS[mode]?.goal ?? MODE_INSTRUCTIONS.pr.goal;
}

/** Multi-line MODE block for system/planner prompts (Agent.ts). */
export function buildModeSection(mode: AppMode, customReviewGoal?: string | null): string {
  const m = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.pr;
  const lines = [`MODE: ${m.label}`, `Goal: ${resolveGoal(mode, customReviewGoal)}`, `Focus: ${m.focus}`];
  if (m.constraints) lines.push(`Constraints: ${m.constraints}`);
  return lines.join('\n');
}

/** One-line mode summary for the voice/brief prompt (DirectorService.ts). */
export function buildModeLine(mode: AppMode, customReviewGoal?: string | null): string {
  const m = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.pr;
  return `Mode: ${m.label} — ${resolveGoal(mode, customReviewGoal)}`;
}
