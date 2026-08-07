/**
 * ContextSnapshot: the authoritative shape of the UI context object
 * passed from ChatContext → EventBus → Agent on every user message.
 *
 * Replaces `context: any` in AgentState so TypeScript catches mismatches
 * between what the UI sends and what Agent.buildContextEnvelope reads.
 */
import type { FileChange, AppMode } from '../../types';
import type { LazyFile } from '../modules/navigation/types';

/** Max chars of active-file content injected into the AI prompt. Content beyond this is truncated. */
export const ACTIVE_FILE_CONTENT_LIMIT = 100_000;

export interface ResolvedFileContent {
  content: string;
  truncated: boolean;
}

/**
 * Resolves the groundable text content of the currently selected file, regardless of
 * whether it's a PR diff entry (FileChange) or a lazily-loaded repo file (LazyFile).
 * Returns null when there's no selection or no content to ground on (e.g. a ghost
 * node whose content hasn't been fetched yet).
 */
export function resolveActiveFileContent(selectedFile: FileChange | LazyFile | null): ResolvedFileContent | null {
  if (!selectedFile) return null;

  const rawContent = 'newContent' in selectedFile
    ? (selectedFile.newContent || selectedFile.oldContent || null)
    : selectedFile.content;

  if (!rawContent) return null;

  const truncated = rawContent.length > ACTIVE_FILE_CONTENT_LIMIT;
  return {
    content: truncated ? rawContent.slice(0, ACTIVE_FILE_CONTENT_LIMIT) : rawContent,
    truncated,
  };
}

export interface ContextSnapshot {
  // Tab and file identity
  activeTab: 'files' | 'annotations' | 'issue' | 'diagrams';
  activeFile: string | null;
  activeFileContent?: string | null; // full content of activeFile, for grounding — see ACTIVE_FILE_CONTENT_LIMIT
  activeFileTruncated?: boolean; // true when activeFileContent was cut at ACTIVE_FILE_CONTENT_LIMIT
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

  // F2: Hierarchical context — active walkthrough section (if any)
  activeSectionTitle: string | null;
  activeSectionDescription: string | null;

  // Review-intent mode: shapes what the AI focuses on (see src/prompts/modeInstructions.ts)
  appMode?: AppMode;
  customReviewGoal?: string | null;
}
