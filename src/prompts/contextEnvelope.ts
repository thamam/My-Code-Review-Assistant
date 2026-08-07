/**
 * src/prompts/contextEnvelope.ts
 *
 * FR-039: Context Middleware — Constructs the "Ground Truth" envelope.
 *
 * Injects all known user-location signals into the prompt so the AI never
 * has to guess where the reviewer is looking. The envelope covers:
 *   - Active file (the file open in the code viewer)
 *   - Visible line range (what the reviewer can currently see)
 *   - Focused line (explicit scroll-to target, more precise than viewport top)
 *   - Text selection (code the reviewer highlighted — strongest signal)
 *   - View mode (diff vs source — changes what line numbers mean)
 *   - Active UI tab
 *   - Active file content (full source, for grounding — see ACTIVE_FILE_CONTENT_LIMIT)
 *
 * Moved verbatim from Agent.ts so both TheiaAgent and SimpleChat share one
 * implementation.
 */
import { ContextSnapshot, ACTIVE_FILE_CONTENT_LIMIT } from '../types/context';

export function buildContextEnvelope(message: string, context: ContextSnapshot | null): string {
  if (!context) {
    return `USER_QUERY: ${message}`;
  }

  const activeFile: string = context.activeFile || 'None';
  const activeTab: string = context.activeTab || 'files';
  const isDiffMode: boolean = context.isDiffMode ?? true;

  const lines: string[] = [];

  lines.push(`ACTIVE_FILE: ${activeFile}`);
  lines.push(`VIEW_MODE: ${isDiffMode ? 'diff' : 'source'}`);
  lines.push(`ACTIVE_TAB: ${activeTab}`);

  // Viewport: the line range currently visible in the code viewer
  if (context.viewportStartLine != null && context.viewportEndLine != null) {
    lines.push(`VISIBLE_LINES: ${context.viewportStartLine}–${context.viewportEndLine}`);
  } else if (context.viewportStartLine != null) {
    lines.push(`VISIBLE_FROM_LINE: ${context.viewportStartLine}`);
  }

  // Focused line: explicit scroll target (stronger than viewport top)
  if (context.focusedLine != null) {
    lines.push(`FOCUSED_LINE: ${context.focusedLine}`);
  }

  // Text selection: the strongest possible location signal — user highlighted this code
  if (context.selectionText) {
    const selRange = context.selectionStartLine != null && context.selectionEndLine != null
      ? ` (lines ${context.selectionStartLine}–${context.selectionEndLine})`
      : '';
    const preview = context.selectionText.length > 300
      ? context.selectionText.slice(0, 300) + '…'
      : context.selectionText;
    lines.push(`SELECTED_CODE${selRange}:\n${preview}`);
  } else if (context.activeSelection) {
    lines.push(`ACTIVE_SELECTION: ${context.activeSelection}`);
  }

  // Active file content — grounds the AI in the actual code, not just its location
  if (context.activeFileContent) {
    const truncationNote = context.activeFileTruncated
      ? ` — TRUNCATED AT ${ACTIVE_FILE_CONTENT_LIMIT} CHARS`
      : '';
    lines.push(`[ACTIVE FILE CONTENT — USE THIS FOR LINE REFERENCES${truncationNote}]\n${context.activeFileContent}\n[/ACTIVE FILE CONTENT]`);
  }

  // F2: Hierarchical context — active walkthrough section
  if (context.activeSectionTitle) {
    lines.push(`ACTIVE_SECTION: ${context.activeSectionTitle}`);
    if (context.activeSectionDescription) {
      lines.push(`SECTION_DESCRIPTION: ${context.activeSectionDescription}`);
    }
  }

  if (activeFile === 'None') {
    lines.push('WARNING: No active file detected. If the user asks about "this file", ASK THEM to open it first. DO NOT GUESS filenames.');
  }

  const contextHeader = `[SYSTEM_CONTEXT]\n${lines.join('\n')}\n[/SYSTEM_CONTEXT]`;

  console.log('[MIDDLEWARE_PROBE] Final Prompt Injection:', contextHeader);

  return `${contextHeader}\n\nUSER_QUERY: ${message}`;
}
