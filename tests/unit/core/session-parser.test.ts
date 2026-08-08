/**
 * session-parser.test.ts
 *
 * Unit tests for the Claude Code JSONL Session Parser (I1).
 * Tests cover: JSONL parsing, conversation ordering, tool classification,
 * file tracking, error detection, and the summarizeSession formatter.
 */

import { describe, it, expect } from 'vitest';
import { parseSessionText, summarizeSession } from '../../../src/lib/session-parser/parser';
import type { ParsedSession } from '../../../src/lib/session-parser/index';

// ─── Test Fixture Helpers ─────────────────────────────────────────────────────

function makeRecord(overrides: {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant';
  sessionId?: string;
  content: string | object[];
  timestamp?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
}): string {
  const record = {
    uuid: overrides.uuid,
    parentUuid: overrides.parentUuid,
    type: overrides.type,
    sessionId: overrides.sessionId ?? 'test-session',
    timestamp: overrides.timestamp ?? '2026-03-06T00:00:00.000Z',
    cwd: overrides.cwd ?? '/home/user/project',
    version: overrides.version ?? '1.0.0',
    gitBranch: overrides.gitBranch ?? 'main',
    message: {
      role: overrides.type === 'user' ? 'user' : 'assistant',
      content: overrides.content,
    },
  };
  return JSON.stringify(record);
}

function makeToolUseBlock(id: string, name: string, input: Record<string, unknown> = {}) {
  return { type: 'tool_use', id, name, input };
}

function makeToolResultBlock(toolUseId: string, content: string, isError = false) {
  return { type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError };
}

// ─── Minimal valid session ────────────────────────────────────────────────────

const MINIMAL_JSONL = [
  makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Write a hello world app' }),
  makeRecord({ uuid: 'a1', parentUuid: 'u1', type: 'assistant', content: [{ type: 'text', text: 'Sure!' }] }),
].join('\n');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseSessionText — basic parsing', () => {
  it('parses a minimal two-turn session', () => {
    const session = parseSessionText(MINIMAL_JSONL);

    expect(session.sessionId).toBe('test-session');
    expect(session.turns).toHaveLength(2);
    expect(session.prompts).toHaveLength(1);
    expect(session.prompts[0].text).toBe('Write a hello world app');
  });

  it('extracts session metadata from first record', () => {
    const session = parseSessionText(MINIMAL_JSONL);

    expect(session.metadata.workingDirectory).toBe('/home/user/project');
    expect(session.metadata.claudeCodeVersion).toBe('1.0.0');
    expect(session.metadata.gitBranch).toBe('main');
    expect(session.metadata.totalTurns).toBe(2);
  });

  it('throws on empty input', () => {
    expect(() => parseSessionText('')).toThrow('No valid JSONL records found');
  });

  it('throws on input with no valid records', () => {
    expect(() => parseSessionText('not json\nalso not json\n')).toThrow();
  });

  it('skips blank lines gracefully', () => {
    const withBlanks = '\n' + MINIMAL_JSONL + '\n\n';
    const session = parseSessionText(withBlanks);
    expect(session.turns).toHaveLength(2);
  });

  it('uses sourcePath as hint but does not affect parsing', () => {
    const session = parseSessionText(MINIMAL_JSONL, '/some/path/session.jsonl');
    expect(session.turns).toHaveLength(2);
  });
});

describe('parseSessionText — conversation ordering', () => {
  it('orders turns by parentUuid chain (BFS)', () => {
    // Three-turn conversation: u1 → a1 → u2
    const jsonl = [
      makeRecord({ uuid: 'u2', parentUuid: 'a1', type: 'user', content: 'Follow-up' }),
      makeRecord({ uuid: 'a1', parentUuid: 'u1', type: 'assistant', content: [{ type: 'text', text: 'Response' }] }),
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'First prompt' }),
    ].join('\n');

    const session = parseSessionText(jsonl);

    // Should be in conversation order despite reversed JSONL order
    expect(session.turns[0].uuid).toBe('u1');
    expect(session.turns[1].uuid).toBe('a1');
    expect(session.turns[2].uuid).toBe('u2');
  });

  it('assigns correct indices to turns', () => {
    const session = parseSessionText(MINIMAL_JSONL);
    expect(session.turns[0].index).toBe(0);
    expect(session.turns[1].index).toBe(1);
  });

  it('preserves roles for each turn', () => {
    const session = parseSessionText(MINIMAL_JSONL);
    expect(session.turns[0].role).toBe('user');
    expect(session.turns[1].role).toBe('assistant');
  });
});

describe('parseSessionText — tool calls', () => {
  it('extracts tool calls from assistant turns', () => {
    const readId = 'tool-read-1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Read some file' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [
          { type: 'text', text: 'Let me read that.' },
          makeToolUseBlock(readId, 'Read', { file_path: 'src/index.ts' }),
        ],
      }),
      makeRecord({
        uuid: 'u2', parentUuid: 'a1', type: 'user',
        content: [makeToolResultBlock(readId, 'file contents here')],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);

    expect(session.toolCalls).toHaveLength(1);
    expect(session.toolCalls[0].name).toBe('Read');
    expect(session.toolCalls[0].category).toBe('file_read');
    expect(session.toolCalls[0].input).toEqual({ file_path: 'src/index.ts' });
  });

  it('correlates tool results to tool calls', () => {
    const readId = 'tool-read-1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Do something' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(readId, 'Read', { file_path: 'foo.ts' })],
      }),
      makeRecord({
        uuid: 'u2', parentUuid: 'a1', type: 'user',
        content: [makeToolResultBlock(readId, 'the content')],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.toolCalls[0].result?.content).toBe('the content');
    expect(session.toolCalls[0].result?.isError).toBe(false);
  });

  it('marks error tool results', () => {
    const toolId = 'fail-1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Do it' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(toolId, 'Bash', { command: 'rm -rf /' })],
      }),
      makeRecord({
        uuid: 'u2', parentUuid: 'a1', type: 'user',
        content: [makeToolResultBlock(toolId, 'Permission denied', true)],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.toolCalls[0].result?.isError).toBe(true);
    expect(session.errorSequences).toHaveLength(1);
    expect(session.errorSequences[0].toolName).toBe('Bash');
  });
});

describe('parseSessionText — tool classification', () => {
  const TOOL_CASES: Array<[string, string]> = [
    ['Read', 'file_read'],
    ['Glob', 'file_read'],
    ['Grep', 'file_read'],
    ['LS', 'file_read'],
    ['View', 'file_read'],             // legacy name
    ['GrepTool', 'file_read'],         // legacy name
    ['Write', 'file_write'],
    ['Edit', 'file_write'],
    ['NotebookEdit', 'file_write'],
    ['Bash', 'shell'],
    ['Task', 'task'],
    ['TaskCreate', 'task'],
    ['Agent', 'agent'],
    ['Skill', 'skill'],
    ['WebFetch', 'search'],
    ['WebSearch', 'search'],
    ['AskUserQuestion', 'ui'],
    ['EnterPlanMode', 'ui'],
    ['mcp__slack__send_message', 'mcp'],
    ['mcp__ide__executeCode', 'mcp'],
    ['SomeUnknownTool', 'other'],
  ];

  for (const [toolName, expectedCategory] of TOOL_CASES) {
    it(`classifies "${toolName}" as "${expectedCategory}"`, () => {
      const toolId = `id-${toolName}`;
      const jsonl = [
        makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Go' }),
        makeRecord({
          uuid: 'a1', parentUuid: 'u1', type: 'assistant',
          content: [makeToolUseBlock(toolId, toolName, {})],
        }),
      ].join('\n');

      const session = parseSessionText(jsonl);
      expect(session.toolCalls[0].category).toBe(expectedCategory);
    });
  }
});

describe('parseSessionText — file tracking', () => {
  it('tracks files read via Read tool', () => {
    const toolId = 'r1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Help' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(toolId, 'Read', { file_path: 'src/app.ts' })],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.filesRead).toHaveLength(1);
    expect(session.filesRead[0].filePath).toBe('src/app.ts');
    expect(session.filesRead[0].tool).toBe('Read');
  });

  it('tracks files written via Write tool', () => {
    const toolId = 'w1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Create file' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(toolId, 'Write', { file_path: 'output.ts', content: 'export {}' })],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.filesWritten).toHaveLength(1);
    expect(session.filesWritten[0].filePath).toBe('output.ts');
    expect(session.filesWritten[0].content).toBe('export {}');
  });

  it('tracks files written via Edit tool with old/new strings', () => {
    const toolId = 'e1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Edit file' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(toolId, 'Edit', {
          file_path: 'src/main.ts',
          old_string: 'const x = 1',
          new_string: 'const x = 2',
        })],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.filesWritten[0].oldString).toBe('const x = 1');
    expect(session.filesWritten[0].newString).toBe('const x = 2');
  });

  it('detects filesNotRead — written without being read first', () => {
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Create file' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock('w1', 'Write', { file_path: 'new-file.ts', content: '// new' })],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.filesNotRead).toContain('new-file.ts');
  });

  it('does NOT flag filesNotRead when file was read before write', () => {
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Edit' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [
          makeToolUseBlock('r1', 'Read', { file_path: 'existing.ts' }),
          makeToolUseBlock('w1', 'Edit', { file_path: 'existing.ts', old_string: 'a', new_string: 'b' }),
        ],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.filesNotRead).not.toContain('existing.ts');
  });
});

describe('parseSessionText — thinking traces', () => {
  it('extracts thinking blocks from assistant turns', () => {
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Think hard' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I should consider...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.thinkingTraces).toHaveLength(1);
    expect(session.thinkingTraces[0].content).toBe('I should consider...');
  });
});

describe('parseSessionText — prompts extraction', () => {
  it('extracts only user text turns as prompts (not tool results)', () => {
    const toolId = 'r1';
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'First prompt' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock(toolId, 'Read', { file_path: 'x.ts' })],
      }),
      makeRecord({
        uuid: 'u2', parentUuid: 'a1', type: 'user',
        content: [makeToolResultBlock(toolId, 'file content')],
      }),
      makeRecord({
        uuid: 'a2', parentUuid: 'u2', type: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
      }),
      makeRecord({ uuid: 'u3', parentUuid: 'a2', type: 'user', content: 'Second prompt' }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    // Only text-content user turns count as prompts
    expect(session.prompts.map(p => p.text)).toEqual(['First prompt', 'Second prompt']);
  });
});

describe('parseSessionText — toolCallsByCategory', () => {
  it('groups tool calls by category', () => {
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Do stuff' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [
          makeToolUseBlock('id1', 'Read', { file_path: 'a.ts' }),
          makeToolUseBlock('id2', 'Bash', { command: 'ls' }),
          makeToolUseBlock('id3', 'Write', { file_path: 'b.ts', content: '' }),
        ],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    expect(session.toolCallsByCategory.file_read).toHaveLength(1);
    expect(session.toolCallsByCategory.shell).toHaveLength(1);
    expect(session.toolCallsByCategory.file_write).toHaveLength(1);
    expect(session.metadata.totalToolCalls).toBe(3);
  });
});

describe('summarizeSession', () => {
  it('returns a non-empty string', () => {
    const session = parseSessionText(MINIMAL_JSONL);
    const summary = summarizeSession(session);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('includes the session ID', () => {
    const session = parseSessionText(MINIMAL_JSONL);
    const summary = summarizeSession(session);
    expect(summary).toContain('test-session');
  });

  it('includes metadata fields', () => {
    const session = parseSessionText(MINIMAL_JSONL);
    const summary = summarizeSession(session);
    expect(summary).toContain('/home/user/project');
    expect(summary).toContain('main');
  });

  it('reports files not read when present', () => {
    const jsonl = [
      makeRecord({ uuid: 'u1', parentUuid: null, type: 'user', content: 'Write something' }),
      makeRecord({
        uuid: 'a1', parentUuid: 'u1', type: 'assistant',
        content: [makeToolUseBlock('w1', 'Write', { file_path: 'blind-write.ts', content: '// oops' })],
      }),
    ].join('\n');

    const session = parseSessionText(jsonl);
    const summary = summarizeSession(session);
    expect(summary).toContain('blind-write.ts');
  });
});
