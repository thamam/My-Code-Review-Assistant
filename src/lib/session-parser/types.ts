/**
 * types.ts — Session Parser Internal Types
 *
 * Raw JSONL record shapes from ~/.claude/projects/[folder]/[uuid].jsonl,
 * plus the structured ParsedSession output type.
 */

// ─── Raw JSONL Record Types ───────────────────────────────────────────────────

/** Content block types that can appear in message.content arrays. */
export type RawContentBlock =
  | RawTextBlock
  | RawThinkingBlock
  | RawToolUseBlock
  | RawToolResultBlock;

export interface RawTextBlock {
  type: 'text';
  text: string;
}

export interface RawThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface RawToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface RawToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | RawContentBlock[];
  is_error?: boolean;
}

/** A raw message object inside a JSONL record. */
export interface RawMessage {
  role: 'user' | 'assistant';
  /** Either a plain string (human prompt) or array of content blocks */
  content: string | RawContentBlock[];
  model?: string;
  id?: string;
}

/** A JSONL record from Claude Code session files. */
export interface RawSessionRecord {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'summary' | string;
  sessionId: string;
  timestamp: string;   // ISO 8601
  message: RawMessage;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  userType?: string;
  slug?: string;
  requestId?: string;
}

// ─── Parsed Output Types ──────────────────────────────────────────────────────

/** Category of a tool call, for grouping and filtering. */
export type ToolCategory =
  | 'file_read'      // Read, Glob, Grep, LS (+ legacy: View, GrepTool)
  | 'file_write'     // Write, Edit, NotebookEdit
  | 'shell'          // Bash
  | 'task'           // Task, TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop
  | 'agent'          // Agent (spawns subagent)
  | 'skill'          // Skill
  | 'search'         // WebFetch, WebSearch
  | 'ui'             // AskUserQuestion, EnterPlanMode, ExitPlanMode
  | 'mcp'            // Any mcp__ prefixed tool
  | 'other';

/** A single tool invocation with its result. */
export interface ToolCall {
  toolUseId: string;
  name: string;
  category: ToolCategory;
  input: Record<string, unknown>;

  /** Correlates to the tool_result block in the following user message */
  result?: ToolResult;

  /** Index of the AI turn this call was made in */
  turnIndex: number;
  timestamp?: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

/** A file that was read (via Read, Glob, Grep, View, etc.) */
export interface FileRead {
  filePath: string;
  tool: string;
  toolUseId: string;
  turnIndex: number;
}

/** A file write (Write or Edit tool call) */
export interface FileWrite {
  filePath: string;
  tool: 'Write' | 'Edit' | 'NotebookEdit' | string;
  /** For Write: full new content. For Edit: the replacement text. */
  content?: string;
  /** Edit-specific: what was replaced */
  oldString?: string;
  newString?: string;
  toolUseId: string;
  turnIndex: number;
}

/** An error or retry sequence in the session */
export interface ErrorSequence {
  /** Tool that produced the error */
  toolName: string;
  toolUseId: string;
  errorMessage: string;
  /** Index of the turn where the error occurred */
  turnIndex: number;
  /** Index of the turn where the AI tried a different approach (if detected) */
  retryTurnIndex?: number;
}

/** A thinking trace from an AI turn */
export interface ThinkingTrace {
  content: string;
  turnIndex: number;
}

/** One turn of the conversation (either user or assistant) */
export interface ConversationTurn {
  uuid: string;
  parentUuid: string | null;
  role: 'user' | 'assistant';
  index: number;   // 0-based position in reconstructed order
  timestamp?: string;

  /** Text content (for user prompts and AI text responses) */
  textContent: string;

  /** Thinking blocks (assistant turns only) */
  thinkingTraces: ThinkingTrace[];

  /** Tool calls made in this turn (assistant turns only) */
  toolCalls: ToolCall[];

  /** Tool results received (user turns that contain tool_result blocks) */
  toolResults: ToolResult[];
}

/**
 * The structured output of the session parser.
 * Consumed by F2 (Hierarchical Context), F4 (Chat), and Review types.
 */
export interface ParsedSession {
  sessionId: string;

  /** Ordered conversation turns (sorted by parentUuid chain) */
  turns: ConversationTurn[];

  /** User prompts (the actual instructions given — text-only user turns) */
  prompts: Array<{
    index: number;   // index into turns
    text: string;
    timestamp?: string;
  }>;

  /** All tool calls extracted across the session */
  toolCalls: ToolCall[];

  /** Tool calls grouped by category */
  toolCallsByCategory: Record<ToolCategory, ToolCall[]>;

  /** Files that were read during the session */
  filesRead: FileRead[];

  /** Files that were written/modified during the session */
  filesWritten: FileWrite[];

  /**
   * Files referenced in prompts or tool calls but NOT read via a file-read tool.
   * Useful for F2: "AI made changes to X without reading Y first."
   */
  filesNotRead: string[];

  /** Thinking traces across the session */
  thinkingTraces: ThinkingTrace[];

  /** Error/retry sequences */
  errorSequences: ErrorSequence[];

  /** Session metadata */
  metadata: {
    workingDirectory?: string;
    claudeCodeVersion?: string;
    gitBranch?: string;
    startedAt?: string;
    totalTurns: number;
    totalToolCalls: number;
  };
}
