/**
 * src/prompts/systemPrompt.ts
 *
 * Shared system-prompt assembly for both engines (TheiaAgent and SimpleChat).
 * `engine: 'agent'` reproduces the original Agent.ts prompt byte-for-byte.
 * `engine: 'simple'` swaps the tool-instruction block for a no-tools
 * constraint, and adds the PR file manifest + language instruction.
 */
import { buildModeSection } from './modeInstructions';
import type { ContextSnapshot } from '../types/context';

export interface SystemPromptInput {
  context: ContextSnapshot | null;
  prData: any;
  engine: 'simple' | 'agent';
  language?: 'English' | 'Hebrew' | 'Auto';
}

const MAX_MANIFEST_FILES = 300;

function buildPrManifest(prData: any): string {
  const files: Array<{ path: string; status: string }> = prData?.files ?? [];
  if (!files.length) return '';

  const shown = files.slice(0, MAX_MANIFEST_FILES);
  const lines = shown.map(f => `- ${f.path} (${f.status})`);
  if (files.length > MAX_MANIFEST_FILES) {
    lines.push(`…and ${files.length - MAX_MANIFEST_FILES} more`);
  }

  return `## PR FILES\n${lines.join('\n')}`;
}

function buildLanguageInstruction(language?: 'English' | 'Hebrew' | 'Auto'): string {
  if (!language || language === 'Auto') {
    return 'Respond in the same language the user uses (primarily English or Hebrew).';
  }
  return `Respond strictly in ${language}.`;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { context, prData, engine, language } = input;
  const activeFile: string = context?.activeFile || 'None';
  const activeTab: string = context?.activeTab || 'files';
  const isDiffMode: boolean = context?.isDiffMode ?? true;

  if (engine === 'agent') {
    // Byte-identical to the original Agent.ts implementation.
    return `You are Theia, a Senior Staff Software Engineer reviewing code.
PR: "${prData?.title || 'Unknown'}"
Author: ${prData?.author || 'Unknown'}

${buildModeSection(context?.appMode ?? 'pr', context?.customReviewGoal)}

Be direct and professional. Use tools proactively to navigate and demonstrate.
When discussing specific code, use navigate_to_code to show the user.
When switching context, use change_tab.
Use toggle_diff_mode to show or hide changes.

Current File: ${activeFile}
Current View Mode: ${isDiffMode ? 'diff' : 'source'}
Current Tab: ${activeTab}`;
  }

  const sections = [
    `You are Theia, a Senior Staff Software Engineer reviewing code.
PR: "${prData?.title || 'Unknown'}"
Author: ${prData?.author || 'Unknown'}`,
    buildModeSection(context?.appMode ?? 'pr', context?.customReviewGoal),
    'Be direct and professional.',
    'You are in Chat mode: you can read and explain code but you CANNOT navigate the viewer, switch tabs, run terminal commands, or edit files. If the user asks for one of those, say so plainly and suggest switching to Agent mode with the toggle in the chat header.',
    buildLanguageInstruction(language),
    buildPrManifest(prData),
    `Current File: ${activeFile}
Current View Mode: ${isDiffMode ? 'diff' : 'source'}
Current Tab: ${activeTab}`,
  ];

  return sections.filter(Boolean).join('\n\n');
}
