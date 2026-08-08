/**
 * parser.ts — Claude Code Session Parser (I1)
 *
 * Ingests a Claude Code JSONL session file and produces a ParsedSession.
 * Input: path to ~/.claude/projects/[folder]/[uuid].jsonl
 * Output: ParsedSession with prompts, tool calls, file reads/writes, errors, timelines.
 */

import type {
  RawSessionRecord,
  RawContentBlock,
  RawToolUseBlock,
  RawToolResultBlock,
  ParsedSession,
  ConversationTurn,
  ToolCall,
  ToolResult,
  ToolCategory,
  FileRead,
  FileWrite,
  ErrorSequence,
  ThinkingTrace,
} from './types';

// ─── Tool Classification ──────────────────────────────────────────────────────

const FILE_READ_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'LS',
  // Legacy Claude Code names
  'View', 'GrepTool', 'ListDirectory',
]);

const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

const SHELL_TOOLS = new Set(['Bash']);

const TASK_TOOLS = new Set([
  'Task', 'TaskCreate', 'TaskUpdate', 'TaskList',
  'TaskGet', 'TaskOutput', 'TaskStop',
]);

const AGENT_TOOLS = new Set(['Agent']);

const SKILL_TOOLS = new Set(['Skill']);

const SEARCH_TOOLS = new Set(['WebFetch', 'WebSearch']);

const UI_TOOLS = new Set([
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'EnterWorktree',
]);

function classifyTool(name: string): ToolCategory {
  if (FILE_READ_TOOLS.has(name)) return 'file_read';
  if (FILE_WRITE_TOOLS.has(name)) return 'file_write';
  if (SHELL_TOOLS.has(name)) return 'shell';
  if (TASK_TOOLS.has(name)) return 'task';
  if (AGENT_TOOLS.has(name)) return 'agent';
  if (SKILL_TOOLS.has(name)) return 'skill';
  if (SEARCH_TOOLS.has(name)) return 'search';
  if (UI_TOOLS.has(name)) return 'ui';
  if (name.startsWith('mcp__')) return 'mcp';
  return 'other';
}

// ─── Content Extraction Helpers ───────────────────────────────────────────────

function extractToolResultContent(content: string | RawContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

// ─── File Path Extraction ─────────────────────────────────────────────────────

function extractFilePath(toolName: string, input: Record<string, unknown>): string | null {
  // Most file tools use file_path or path
  const raw = input['file_path'] ?? input['path'] ?? input['filePath'];
  if (typeof raw === 'string') return raw;

  // Glob uses pattern, which may be a path
  if (toolName === 'Glob' || toolName === 'ListDirectory') {
    const p = input['pattern'] ?? input['directory'];
    if (typeof p === 'string') return p;
  }

  // Grep uses path
  if (toolName === 'Grep') {
    const p = input['path'];
    if (typeof p === 'string') return p;
  }

  return null;
}

// ─── JSONL Line Parsing ───────────────────────────────────────────────────────

function parseJSONLLine(line: string): RawSessionRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as RawSessionRecord;
  } catch {
    return null;
  }
}

// ─── Conversation Ordering ────────────────────────────────────────────────────

/**
 * Reconstruct conversation order from the parentUuid tree.
 * Claude Code JSONL records aren't always in strict conversation order,
 * but each record has parentUuid pointing to its parent.
 * We do a topological sort to get correct ordering.
 */
function orderByParentChain(records: RawSessionRecord[]): RawSessionRecord[] {
  // Filter to only conversation records
  const conversationRecords = records.filter(
    r => r.type === 'user' || r.type === 'assistant'
  );

  // Find roots (parentUuid === null)
  const roots = conversationRecords.filter(r => r.parentUuid === null);

  // BFS from roots to get ordered list
  const ordered: RawSessionRecord[] = [];
  const queue = [...roots];
  const visited = new Set<string>();

  // Build children map
  const children = new Map<string, RawSessionRecord[]>();
  for (const r of conversationRecords) {
    if (r.parentUuid) {
      const list = children.get(r.parentUuid) ?? [];
      list.push(r);
      children.set(r.parentUuid, list);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.uuid)) continue;
    visited.add(current.uuid);
    ordered.push(current);

    const kids = children.get(current.uuid) ?? [];
    // Sort children by timestamp if available for determinism
    kids.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      return 0;
    });
    queue.push(...kids);
  }

  // Any orphans not reachable from roots (shouldn't happen but be safe)
  for (const r of conversationRecords) {
    if (!visited.has(r.uuid)) {
      ordered.push(r);
    }
  }

  return ordered;
}

// ─── Tool Result Correlation ──────────────────────────────────────────────────

/**
 * Build a map from tool_use_id → ToolResult by scanning all records.
 * Tool results appear in the following user record's content array.
 */
function buildToolResultMap(records: RawSessionRecord[]): Map<string, ToolResult> {
  const map = new Map<string, ToolResult>();

  for (const record of records) {
    if (record.type !== 'user') continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== 'tool_result') continue;
      const tr = block as RawToolResultBlock;
      map.set(tr.tool_use_id, {
        content: extractToolResultContent(tr.content),
        isError: tr.is_error === true,
      });
    }
  }

  return map;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Claude Code JSONL session file into a structured ParsedSession.
 * Works in both Node.js (using fs) and browser (accepts pre-loaded text).
 */
export async function parseSessionFile(jsonlPath: string): Promise<ParsedSession> {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(jsonlPath, 'utf-8');
  return parseSessionText(text, jsonlPath);
}

/**
 * Parse Claude Code JSONL content from a string.
 * Used when the caller has already loaded the file contents.
 */
export function parseSessionText(text: string, sourcePath?: string): ParsedSession {
  // Parse all lines
  const rawRecords: RawSessionRecord[] = [];
  for (const line of text.split('\n')) {
    const record = parseJSONLLine(line);
    if (record && record.message) {
      rawRecords.push(record);
    }
  }

  if (rawRecords.length === 0) {
    throw new Error('No valid JSONL records found in session file');
  }

  // Extract session metadata from first conversation record
  const firstRecord = rawRecords.find(r => r.type === 'user' || r.type === 'assistant');
  const sessionId = firstRecord?.sessionId ?? 'unknown';

  // Build tool result correlation map
  const toolResultMap = buildToolResultMap(rawRecords);

  // Order records by parentUuid chain
  const orderedRecords = orderByParentChain(rawRecords);

  // ── Build conversation turns ──────────────────────────────────────────────
  const turns: ConversationTurn[] = [];
  const allToolCalls: ToolCall[] = [];
  const filesRead: FileRead[] = [];
  const filesWritten: FileWrite[] = [];
  const errorSequences: ErrorSequence[] = [];
  const allThinkingTraces: ThinkingTrace[] = [];

  const filesReadPaths = new Set<string>();

  for (let i = 0; i < orderedRecords.length; i++) {
    const record = orderedRecords[i];
    const role = record.message?.role ?? record.type as 'user' | 'assistant';
    const content = record.message?.content;
    const turnIndex = i;

    const turn: ConversationTurn = {
      uuid: record.uuid,
      parentUuid: record.parentUuid,
      role: role as 'user' | 'assistant',
      index: turnIndex,
      timestamp: record.timestamp,
      textContent: '',
      thinkingTraces: [],
      toolCalls: [],
      toolResults: [],
    };

    if (typeof content === 'string') {
      // Simple text message (human prompt)
      turn.textContent = content;
    } else if (Array.isArray(content)) {
      const textParts: string[] = [];

      for (const block of content) {
        if (!block || typeof block !== 'object') continue;

        switch (block.type) {
          case 'text':
            textParts.push(block.text ?? '');
            break;

          case 'thinking': {
            const trace: ThinkingTrace = {
              content: block.thinking ?? '',
              turnIndex,
            };
            turn.thinkingTraces.push(trace);
            allThinkingTraces.push(trace);
            break;
          }

          case 'tool_use': {
            const tu = block as RawToolUseBlock;
            const category = classifyTool(tu.name);
            const result = toolResultMap.get(tu.id);

            const toolCall: ToolCall = {
              toolUseId: tu.id,
              name: tu.name,
              category,
              input: tu.input ?? {},
              result,
              turnIndex,
              timestamp: record.timestamp,
            };

            turn.toolCalls.push(toolCall);
            allToolCalls.push(toolCall);

            // Track file reads
            if (category === 'file_read') {
              const filePath = extractFilePath(tu.name, tu.input ?? {});
              if (filePath) {
                filesReadPaths.add(filePath);
                filesRead.push({
                  filePath,
                  tool: tu.name,
                  toolUseId: tu.id,
                  turnIndex,
                });
              }
            }

            // Track file writes
            if (category === 'file_write') {
              const filePath = extractFilePath(tu.name, tu.input ?? {});
              if (filePath) {
                const fw: FileWrite = {
                  filePath,
                  tool: tu.name,
                  toolUseId: tu.id,
                  turnIndex,
                };

                if (tu.name === 'Write') {
                  fw.content = typeof tu.input?.content === 'string'
                    ? tu.input.content
                    : undefined;
                } else if (tu.name === 'Edit') {
                  fw.oldString = typeof tu.input?.old_string === 'string'
                    ? tu.input.old_string
                    : undefined;
                  fw.newString = typeof tu.input?.new_string === 'string'
                    ? tu.input.new_string
                    : undefined;
                }

                filesWritten.push(fw);
              }
            }

            // Track errors
            if (result?.isError) {
              const error: ErrorSequence = {
                toolName: tu.name,
                toolUseId: tu.id,
                errorMessage: result.content,
                turnIndex,
              };

              // Look ahead to detect retry: if next assistant turn uses the same tool
              // or mentions an alternative approach, link it
              const nextAssistant = orderedRecords
                .slice(i + 1)
                .find(r => r.message?.role === 'assistant' || r.type === 'assistant');
              if (nextAssistant) {
                error.retryTurnIndex = orderedRecords.indexOf(nextAssistant);
              }

              errorSequences.push(error);
            }
            break;
          }

          case 'tool_result': {
            const tr = block as RawToolResultBlock;
            turn.toolResults.push({
              content: extractToolResultContent(tr.content),
              isError: tr.is_error === true,
            });
            break;
          }
        }
      }

      turn.textContent = textParts.join('\n').trim();
    }

    turns.push(turn);
  }

  // ── Extract prompts (text-only user turns with non-empty content) ──────────
  const prompts = turns
    .filter(t => t.role === 'user' && t.textContent.trim().length > 0)
    .map(t => ({
      index: t.index,
      text: t.textContent,
      timestamp: t.timestamp,
    }));

  // ── Group tool calls by category ──────────────────────────────────────────
  const toolCallsByCategory: Record<ToolCategory, ToolCall[]> = {
    file_read: [],
    file_write: [],
    shell: [],
    task: [],
    agent: [],
    skill: [],
    search: [],
    ui: [],
    mcp: [],
    other: [],
  };
  for (const tc of allToolCalls) {
    toolCallsByCategory[tc.category].push(tc);
  }

  // ── Compute filesNotRead ──────────────────────────────────────────────────
  // Files that were written but never read — potential review risk signal
  const filesWrittenPaths = new Set(filesWritten.map(fw => fw.filePath));
  const filesNotRead = [...filesWrittenPaths].filter(f => !filesReadPaths.has(f));

  // ── Metadata ──────────────────────────────────────────────────────────────
  const metadata = {
    workingDirectory: firstRecord?.cwd,
    claudeCodeVersion: firstRecord?.version,
    gitBranch: firstRecord?.gitBranch,
    startedAt: firstRecord?.timestamp,
    totalTurns: turns.length,
    totalToolCalls: allToolCalls.length,
  };

  return {
    sessionId,
    turns,
    prompts,
    toolCalls: allToolCalls,
    toolCallsByCategory,
    filesRead,
    filesWritten,
    filesNotRead,
    thinkingTraces: allThinkingTraces,
    errorSequences,
    metadata,
  };
}

// ─── Summary Formatter ────────────────────────────────────────────────────────

/** Print a human-readable summary for smoke testing. */
export function summarizeSession(session: ParsedSession): string {
  const lines: string[] = [];

  lines.push(`\n${'─'.repeat(60)}`);
  lines.push(`SESSION: ${session.sessionId}`);
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`Working dir: ${session.metadata.workingDirectory ?? 'unknown'}`);
  lines.push(`Claude Code: ${session.metadata.claudeCodeVersion ?? 'unknown'}`);
  lines.push(`Git branch:  ${session.metadata.gitBranch ?? 'unknown'}`);
  lines.push(`Started at:  ${session.metadata.startedAt ?? 'unknown'}`);
  lines.push('');

  lines.push(`CONVERSATION`);
  lines.push(`  Total turns:     ${session.metadata.totalTurns}`);
  lines.push(`  Prompts:         ${session.prompts.length}`);
  lines.push(`  Thinking traces: ${session.thinkingTraces.length}`);
  lines.push('');

  lines.push(`TOOL CALLS (${session.metadata.totalToolCalls} total)`);
  const cats = Object.entries(session.toolCallsByCategory)
    .filter(([, calls]) => calls.length > 0)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [cat, calls] of cats) {
    const tools = [...new Set(calls.map(c => c.name))].join(', ');
    lines.push(`  ${cat.padEnd(12)} ${String(calls.length).padStart(4)} calls  [${tools}]`);
  }
  lines.push('');

  lines.push(`FILES`);
  lines.push(`  Read:     ${session.filesRead.length} reads across ${new Set(session.filesRead.map(f => f.filePath)).size} unique paths`);
  lines.push(`  Written:  ${session.filesWritten.length} writes across ${new Set(session.filesWritten.map(f => f.filePath)).size} unique paths`);
  lines.push(`  Not read before write (⚠️):  ${session.filesNotRead.length}`);
  if (session.filesNotRead.length > 0 && session.filesNotRead.length <= 10) {
    for (const f of session.filesNotRead) {
      lines.push(`    - ${f}`);
    }
  }
  lines.push('');

  lines.push(`ERRORS & RETRIES`);
  lines.push(`  Error sequences: ${session.errorSequences.length}`);
  if (session.errorSequences.length > 0) {
    const byTool: Record<string, number> = {};
    for (const e of session.errorSequences) {
      byTool[e.toolName] = (byTool[e.toolName] ?? 0) + 1;
    }
    for (const [tool, count] of Object.entries(byTool).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${tool}: ${count} errors`);
    }
  }
  lines.push('');

  lines.push(`SAMPLE PROMPTS (first 3)`);
  for (const prompt of session.prompts.slice(0, 3)) {
    const preview = prompt.text.slice(0, 120).replace(/\n/g, ' ');
    lines.push(`  [${prompt.index}] ${preview}${prompt.text.length > 120 ? '…' : ''}`);
  }
  lines.push(`${'─'.repeat(60)}\n`);

  return lines.join('\n');
}
