import { describe, it, expect } from 'vitest';
import { agent } from '../../../src/modules/core/Agent';
import { ACTIVE_FILE_CONTENT_LIMIT } from '../../../src/types/context';

// Access private method via 'any' casting for testing purposes
const agentAny = agent as any;

describe('Agent Context Injection (buildContextEnvelope)', () => {

  // ── Basic file / tab ──────────────────────────────────────────────────────

  it('injects ACTIVE_FILE when present', () => {
    const envelope = agentAny.buildContextEnvelope('Hello', { activeFile: 'src/main.ts', activeTab: 'files' });
    expect(envelope).toContain('ACTIVE_FILE: src/main.ts');
    expect(envelope).not.toContain('WARNING: No active file detected');
  });

  it('injects WARNING and ACTIVE_FILE: None when activeFile is null', () => {
    const envelope = agentAny.buildContextEnvelope('Hello', { activeFile: null, activeTab: 'files' });
    expect(envelope).toContain('ACTIVE_FILE: None');
    expect(envelope).toContain('WARNING: No active file detected');
    expect(envelope).toContain('DO NOT GUESS filenames');
  });

  it('injects ACTIVE_TAB', () => {
    const envelope = agentAny.buildContextEnvelope('Hello', { activeFile: 'f.ts', activeTab: 'annotations' });
    expect(envelope).toContain('ACTIVE_TAB: annotations');
  });

  // ── VIEW_MODE ─────────────────────────────────────────────────────────────

  it('injects VIEW_MODE: diff when isDiffMode is true', () => {
    const envelope = agentAny.buildContextEnvelope('Q', { activeFile: 'f.ts', isDiffMode: true });
    expect(envelope).toContain('VIEW_MODE: diff');
  });

  it('injects VIEW_MODE: source when isDiffMode is false', () => {
    const envelope = agentAny.buildContextEnvelope('Q', { activeFile: 'f.ts', isDiffMode: false });
    expect(envelope).toContain('VIEW_MODE: source');
  });

  it('defaults VIEW_MODE to diff when isDiffMode is undefined', () => {
    const envelope = agentAny.buildContextEnvelope('Q', { activeFile: 'f.ts' });
    expect(envelope).toContain('VIEW_MODE: diff');
  });

  // ── VISIBLE_LINES ─────────────────────────────────────────────────────────

  it('injects VISIBLE_LINES range when both start and end are provided', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      viewportStartLine: 10,
      viewportEndLine: 50,
    });
    expect(envelope).toContain('VISIBLE_LINES: 10–50');
  });

  it('injects VISIBLE_FROM_LINE when only startLine is provided', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      viewportStartLine: 42,
      viewportEndLine: null,
    });
    expect(envelope).toContain('VISIBLE_FROM_LINE: 42');
  });

  it('omits viewport line info when both are null', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      viewportStartLine: null,
      viewportEndLine: null,
    });
    expect(envelope).not.toContain('VISIBLE_LINES');
    expect(envelope).not.toContain('VISIBLE_FROM_LINE');
  });

  // ── FOCUSED_LINE ──────────────────────────────────────────────────────────

  it('injects FOCUSED_LINE when present', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      focusedLine: 77,
    });
    expect(envelope).toContain('FOCUSED_LINE: 77');
  });

  it('omits FOCUSED_LINE when null', () => {
    const envelope = agentAny.buildContextEnvelope('Q', { activeFile: 'f.ts', focusedLine: null });
    expect(envelope).not.toContain('FOCUSED_LINE');
  });

  // ── SELECTED_CODE ─────────────────────────────────────────────────────────

  it('injects SELECTED_CODE with line range', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      selectionText: 'const x = 1;',
      selectionStartLine: 20,
      selectionEndLine: 20,
    });
    expect(envelope).toContain('SELECTED_CODE (lines 20–20)');
    expect(envelope).toContain('const x = 1;');
  });

  it('injects SELECTED_CODE without range when line info missing', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      selectionText: 'function foo() {}',
    });
    expect(envelope).toContain('SELECTED_CODE:');
    expect(envelope).toContain('function foo() {}');
  });

  it('truncates very long selections to 300 chars', () => {
    const longText = 'x'.repeat(500);
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      selectionText: longText,
    });
    // Should contain the preview + ellipsis, not the full 500 chars
    expect(envelope).toContain('…');
    expect(envelope.length).toBeLessThan(longText.length + 500); // sanity bound
  });

  it('falls back to legacy activeSelection when selectionText absent', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      activeSelection: 'some selected text',
    });
    expect(envelope).toContain('ACTIVE_SELECTION: some selected text');
  });

  // ── Full context snapshot ─────────────────────────────────────────────────

  it('produces a complete context envelope with all signals', () => {
    const envelope = agentAny.buildContextEnvelope('What does this do?', {
      activeFile: 'src/auth/middleware.ts',
      activeTab: 'files',
      isDiffMode: false,
      viewportStartLine: 30,
      viewportEndLine: 80,
      focusedLine: 55,
      selectionText: 'return next(err)',
      selectionStartLine: 55,
      selectionEndLine: 55,
    });

    expect(envelope).toContain('ACTIVE_FILE: src/auth/middleware.ts');
    expect(envelope).toContain('VIEW_MODE: source');
    expect(envelope).toContain('ACTIVE_TAB: files');
    expect(envelope).toContain('VISIBLE_LINES: 30–80');
    expect(envelope).toContain('FOCUSED_LINE: 55');
    expect(envelope).toContain('SELECTED_CODE (lines 55–55)');
    expect(envelope).toContain('return next(err)');
    expect(envelope).toContain('USER_QUERY: What does this do?');
    expect(envelope).toContain('[SYSTEM_CONTEXT]');
    expect(envelope).toContain('[/SYSTEM_CONTEXT]');
  });

  // ── F2: ACTIVE_SECTION ────────────────────────────────────────────────────

  it('injects ACTIVE_SECTION and SECTION_DESCRIPTION when active section is set', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      activeSectionTitle: 'Authentication Flow',
      activeSectionDescription: 'Covers the JWT validation middleware and token refresh logic.',
    });
    expect(envelope).toContain('ACTIVE_SECTION: Authentication Flow');
    expect(envelope).toContain('SECTION_DESCRIPTION: Covers the JWT validation middleware and token refresh logic.');
  });

  it('omits ACTIVE_SECTION when activeSectionTitle is null', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      activeSectionTitle: null,
      activeSectionDescription: null,
    });
    expect(envelope).not.toContain('ACTIVE_SECTION');
    expect(envelope).not.toContain('SECTION_DESCRIPTION');
  });

  it('injects ACTIVE_SECTION without SECTION_DESCRIPTION when description is missing', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'f.ts',
      activeSectionTitle: 'Database Layer',
      activeSectionDescription: null,
    });
    expect(envelope).toContain('ACTIVE_SECTION: Database Layer');
    expect(envelope).not.toContain('SECTION_DESCRIPTION');
  });

  // ── ACTIVE FILE CONTENT (grounding) ──────────────────────────────────────

  it('injects ACTIVE FILE CONTENT block when activeFileContent is present', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'src/main.ts',
      activeFileContent: 'export const x = 1;',
    });
    expect(envelope).toContain('[ACTIVE FILE CONTENT — USE THIS FOR LINE REFERENCES]');
    expect(envelope).toContain('export const x = 1;');
    expect(envelope).toContain('[/ACTIVE FILE CONTENT]');
    expect(envelope).not.toContain('TRUNCATED');
  });

  it('notes truncation in the block header when activeFileTruncated is true', () => {
    const truncatedContent = 'x'.repeat(ACTIVE_FILE_CONTENT_LIMIT);
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'src/main.ts',
      activeFileContent: truncatedContent,
      activeFileTruncated: true,
    });
    expect(envelope).toContain(`TRUNCATED AT ${ACTIVE_FILE_CONTENT_LIMIT} CHARS`);
    expect(envelope).toContain(truncatedContent);
  });

  it('omits the ACTIVE FILE CONTENT block when there is no active file', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: null,
      activeFileContent: null,
    });
    expect(envelope).not.toContain('ACTIVE FILE CONTENT');
  });

  it('omits the ACTIVE FILE CONTENT block when content is empty', () => {
    const envelope = agentAny.buildContextEnvelope('Q', {
      activeFile: 'src/main.ts',
      activeFileContent: '',
    });
    expect(envelope).not.toContain('ACTIVE FILE CONTENT');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns bare USER_QUERY when context is undefined', () => {
    const envelope = agentAny.buildContextEnvelope('Hello', undefined);
    expect(envelope).toBe('USER_QUERY: Hello');
  });

  it('always includes USER_QUERY', () => {
    const envelope = agentAny.buildContextEnvelope('my question', { activeFile: 'f.ts' });
    expect(envelope).toContain('USER_QUERY: my question');
  });
});
