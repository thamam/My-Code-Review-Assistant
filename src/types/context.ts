/**
 * ContextSnapshot: the authoritative shape of the UI context object
 * passed from ChatContext → EventBus → Agent on every user message.
 *
 * Replaces `context: any` in AgentState so TypeScript catches mismatches
 * between what the UI sends and what Agent.buildContextEnvelope reads.
 */
export interface ContextSnapshot {
  // Tab and file identity
  activeTab: 'files' | 'annotations' | 'issue' | 'diagrams';
  activeFile: string | null;
  activeSelection: string | null; // legacy — prefer selectionText
  activeDiagram: string | null;

  // Viewport: the line range currently visible in the code viewer
  viewportStartLine: number | null;
  viewportEndLine: number | null;

  // Focused line: explicit scroll target set by navigation (stronger than viewport)
  focusedLine: number | null;

  // View mode: diff (added/removed) vs source (full file)
  isDiffMode: boolean;

  // Text selection: the strongest possible location signal
  selectionStartLine: number | null;
  selectionEndLine: number | null;
  selectionText: string | null;
}
