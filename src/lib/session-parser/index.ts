/**
 * session-parser — Claude Code JSONL Session Parser (I1)
 *
 * Public API for parsing Claude Code generation sessions.
 * Consumed by F2 (Hierarchical Context) and F4 (Chat with PR Memory).
 */

export type {
  ParsedSession,
  ConversationTurn,
  ToolCall,
  ToolResult,
  ToolCategory,
  FileRead,
  FileWrite,
  ErrorSequence,
  ThinkingTrace,
  RawSessionRecord,
} from './types.js';

export { parseSessionFile, parseSessionText, summarizeSession } from './parser.js';
