import { describe, it, expect, vi, afterEach } from 'vitest';
import { eventBus } from '../../../../src/modules/core/EventBus';

// propose_diagrams constructs `new DiagramAgent()` internally (it isn't
// injected through ToolDispatchContext), so isolating the fallback-selection
// test from the real network call means mocking the class it constructs.
const proposeDiagramsMock = vi.fn().mockResolvedValue([]);
vi.mock('../../../../src/services/diagramAgent', () => ({
  DiagramAgent: class {
    proposeDiagrams(...args: any[]) { return proposeDiagramsMock(...args); }
    generateCustomDiagram() { return Promise.resolve(undefined); }
  },
}));

import {
  TOOL_DEFINITIONS,
  uiTools,
  knowledgeTools,
  executorTools,
  SENSITIVE_TOOLS,
  isReadOnlyInvocation,
  dispatchTool,
  scoreToolOutcome,
  executeCommandAndWait,
  type ToolDispatchContext,
} from '../../../../src/modules/core/agent/toolRegistry';

const baseCtx: ToolDispatchContext = { lastUserInteraction: 0 };

describe('toolRegistry — schema/handler/classification stay together', () => {
  it('declares exactly the eight tools, grouped ui then knowledge (matches original executorTools order)', () => {
    expect(TOOL_DEFINITIONS.map(t => t.name)).toEqual([
      'navigate_to_code', 'change_tab', 'toggle_diff_mode', 'run_terminal_command', 'write_file',
      'find_file', 'search_text', 'propose_diagrams',
    ]);
    expect(executorTools.map(t => t.name)).toEqual([...uiTools, ...knowledgeTools].map(t => t.name));
  });

  it('classifies exactly run_terminal_command and write_file as sensitive', () => {
    expect(SENSITIVE_TOOLS.sort()).toEqual(['run_terminal_command', 'write_file']);
  });

  it('every tool has a schema whose name matches its registry key', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.schema.name).toBe(tool.name);
    }
  });
});

describe('isReadOnlyInvocation', () => {
  it('treats a plain ls as read-only', () => {
    expect(isReadOnlyInvocation('run_terminal_command', { command: 'ls', args: ['-la'] })).toBe(true);
  });

  it('treats an unlisted command (rm) as not read-only', () => {
    expect(isReadOnlyInvocation('run_terminal_command', { command: 'rm', args: ['-rf', '/'] })).toBe(false);
  });

  it('rejects find with an unsafe flag (-exec)', () => {
    expect(isReadOnlyInvocation('run_terminal_command', { command: 'find', args: ['.', '-exec', 'rm', '{}', ';'] })).toBe(false);
  });

  it('accepts find with only safe filtering flags', () => {
    expect(isReadOnlyInvocation('run_terminal_command', { command: 'find', args: ['.', '-name', '*.ts'] })).toBe(true);
  });

  it('fails closed when args.args is not an array', () => {
    expect(isReadOnlyInvocation('run_terminal_command', { command: 'ls', args: 'not-an-array' })).toBe(false);
  });

  it('is always false for tools other than run_terminal_command', () => {
    expect(isReadOnlyInvocation('write_file', { command: 'ls' })).toBe(false);
  });
});

describe('scoreToolOutcome (the Judge)', () => {
  it('scores a clean exit-0 marker as success', () => {
    expect(scoreToolOutcome('done\n[Exit Code: 0]')).toEqual({ output: 'done\n[Exit Code: 0]', ok: true, exitCode: 0 });
  });

  it('scores a non-zero exit marker as failure', () => {
    expect(scoreToolOutcome('boom\n[Exit Code: 2]')).toEqual({ output: 'boom\n[Exit Code: 2]', ok: false, exitCode: 2 });
  });

  it('scores output with no exit marker as success (UI tools never emit one)', () => {
    expect(scoreToolOutcome('Switched tab to files')).toEqual({ output: 'Switched tab to files', ok: true, exitCode: null });
  });

  it('scores a safety-timeout marker as failure even though it resolved, not threw', () => {
    const result = scoreToolOutcome('partial...\n[Error: Command timed out after 15000ms]');
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
  });
});

describe('dispatchTool — UI tools', () => {
  afterEach(() => vi.restoreAllMocks());

  it('change_tab emits AGENT_TAB_SWITCH and reports the switch', async () => {
    const seen: any[] = [];
    const unsub = eventBus.subscribe('AGENT_TAB_SWITCH', (e: any) => seen.push(e.event));
    const result = await dispatchTool('change_tab', { tab_name: 'diagrams' }, baseCtx);
    unsub();
    expect(result).toBe('Switched tab to diagrams');
    expect(seen).toHaveLength(1);
    expect(seen[0].payload.tab).toBe('diagrams');
  });

  it('toggle_diff_mode emits AGENT_DIFF_MODE with the requested state', async () => {
    const seen: any[] = [];
    const unsub = eventBus.subscribe('AGENT_DIFF_MODE', (e: any) => seen.push(e.event));
    await dispatchTool('toggle_diff_mode', { enable: true }, baseCtx);
    unsub();
    expect(seen[0].payload.enable).toBe(true);
  });

  it('navigate_to_code emits AGENT_NAVIGATE when the user has been idle', async () => {
    const seen: any[] = [];
    const unsub = eventBus.subscribe('AGENT_NAVIGATE', (e: any) => seen.push(e.event));
    const result = await dispatchTool('navigate_to_code', { filepath: 'src/x.ts', line: 12 }, { lastUserInteraction: 0 });
    unsub();
    expect(result).toBe('Mapped to src/x.ts');
    expect(seen[0].payload.target).toEqual({ file: 'src/x.ts', line: 12 });
  });

  it('navigate_to_code is skipped by the Focus Lock within 3s of user activity', async () => {
    const seen: any[] = [];
    const unsub = eventBus.subscribe('AGENT_NAVIGATE', (e: any) => seen.push(e.event));
    const result = await dispatchTool('navigate_to_code', { filepath: 'src/x.ts' }, { lastUserInteraction: Date.now() });
    unsub();
    expect(result).toBe('Navigation skipped (Focus Locked by User)');
    expect(seen).toHaveLength(0);
  });
});

describe('dispatchTool — knowledge tools', () => {
  it('find_file reports no matches against an unindexed search service', async () => {
    const result = await dispatchTool('find_file', { name: 'DoesNotExist' }, baseCtx);
    expect(result).toBe('No files found with that name.');
  });

  it('propose_diagrams reports an error when no PR data is available from either source', async () => {
    const result = await dispatchTool('propose_diagrams', {}, baseCtx);
    expect(result).toBe('Error: No PR data available for diagram generation.');
  });

  it('propose_diagrams falls back to ctx.fallbackPrData when ctx.prData is absent', async () => {
    proposeDiagramsMock.mockClear();
    const fallback = { title: 'PR', files: [] };
    const result = await dispatchTool('propose_diagrams', {}, { ...baseCtx, fallbackPrData: fallback });
    expect(proposeDiagramsMock).toHaveBeenCalledWith(fallback);
    expect(result).toBe('Generated 0 diagrams:\n\n');
  });

  it('propose_diagrams prefers ctx.prData over ctx.fallbackPrData when both are present', async () => {
    proposeDiagramsMock.mockClear();
    const real = { title: 'Real PR', files: [] };
    const fallback = { title: 'Stale fallback', files: [] };
    await dispatchTool('propose_diagrams', {}, { ...baseCtx, prData: real, fallbackPrData: fallback });
    expect(proposeDiagramsMock).toHaveBeenCalledWith(real);
  });
});

describe('dispatchTool — unknown tool', () => {
  it('returns "Unknown tool" and warns, without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await dispatchTool('not_a_real_tool', {}, baseCtx);
    expect(result).toBe('Unknown tool');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not_a_real_tool'));
    warn.mockRestore();
  });
});

describe('executeCommandAndWait', () => {
  it('resolves with buffered stdout and no suffix on a clean exit 0', async () => {
    const unsub = eventBus.subscribe('AGENT_EXEC_CMD', () => {
      eventBus.emit({ type: 'RUNTIME_OUTPUT', payload: { stream: 'stdout', data: 'hello\n' } });
      eventBus.emit({ type: 'RUNTIME_EXIT', payload: { exitCode: 0 } });
    });
    const result = await executeCommandAndWait('echo', ['hello']);
    unsub();
    expect(result).toBe('hello\n');
  });

  it('appends an [Exit Code: N] marker on a non-zero exit', async () => {
    const unsub = eventBus.subscribe('AGENT_EXEC_CMD', () => {
      eventBus.emit({ type: 'RUNTIME_OUTPUT', payload: { stream: 'stderr', data: 'nope\n' } });
      eventBus.emit({ type: 'RUNTIME_EXIT', payload: { exitCode: 1 } });
    });
    const result = await executeCommandAndWait('false', []);
    unsub();
    expect(result).toBe('nope\n\n[Exit Code: 1]');
  });

  it('resolves with a timeout marker (not a rejection) when no RUNTIME_EXIT ever arrives', async () => {
    vi.useFakeTimers();
    try {
      const promise = executeCommandAndWait('sleep', ['forever']);
      await vi.advanceTimersByTimeAsync(15000);
      const result = await promise;
      expect(result).toContain('[Error: Command timed out after 15000ms]');
    } finally {
      vi.useRealTimers();
    }
  });
});
