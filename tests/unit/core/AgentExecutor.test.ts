import { describe, it, expect, vi } from 'vitest';
import { TheiaAgent } from '../../../src/modules/core/Agent';
import { eventBus } from '../../../src/modules/core/EventBus';
import type { AgentPlan, PlanStep } from '../../../src/modules/planner/types';

/**
 * Executor + Judge unit tests.
 *
 * The executor is exercised directly (bypassing the LangGraph edges) with a stubbed
 * Gemini client, so every assertion is about what the node does with the model's
 * function call — never about what the model decides.
 */

/** Builds an agent whose single Gemini round-trip returns the given response parts. */
function makeAgent(parts: any[]): any {
  const inst = new TheiaAgent() as any;
  inst.ai = {
    models: {
      generateContent: vi.fn().mockResolvedValue({ candidates: [{ content: { parts } }] }),
    },
  };
  return inst;
}

/** A model response containing one forced tool call. */
const toolCall = (name: string | undefined, args: any) => [{ functionCall: { name, args } }];

function makePlan(steps: Array<Partial<PlanStep>>): AgentPlan {
  return {
    id: 'plan-1',
    goal: 'Investigate the failing test',
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      description: `step ${i}`,
      status: 'pending' as const,
      ...s,
    })),
    activeStepIndex: 0,
    status: 'executing',
    generatedAt: 0,
  };
}

const stateFor = (plan: AgentPlan) => ({
  messages: [{ role: 'user', content: 'go' }],
  context: null,
  prData: { title: 'PR' },
  plan,
});

/** Records AGENT_REQUEST_APPROVAL emissions for the duration of one test. */
function captureApprovals() {
  const seen: any[] = [];
  const unsubscribe = eventBus.subscribe('AGENT_REQUEST_APPROVAL', (envelope: any) => {
    seen.push(envelope.event);
  });
  return { seen, unsubscribe };
}

describe('executorNode — tool + args come from the model function call', () => {
  it('executes the tool the model called, not the tool the planner suggested', async () => {
    const inst = makeAgent(toolCall('search_text', { query: 'interface AgentState' }));
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('src/x.ts:1: interface AgentState');

    // The planner only ever suggests a tool; the executor re-decides.
    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'find_file' }])));

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0][0]).toBe('search_text');
    expect(executeTool.mock.calls[0][1]).toEqual({ query: 'interface AgentState' });
    expect(result.plan.steps[0].status).toBe('completed');
  });

  it('passes the call arguments through, never a stale currentStep.args', async () => {
    const inst = makeAgent(toolCall('find_file', { name: 'Agent' }));
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('Found files:\n- Agent.ts');

    const plan = makePlan([{ tool: 'find_file', args: { name: 'STALE' } }]);
    await inst.executorNode(stateFor(plan));

    expect(executeTool.mock.calls[0][1]).toEqual({ name: 'Agent' });
  });

  it('falls back to the planner-suggested tool when the call carries no name', async () => {
    const inst = makeAgent([{ functionCall: { args: { name: 'Agent' } } }]);
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('Found files:\n- Agent.ts');

    await inst.executorNode(stateFor(makePlan([{ tool: 'find_file' }])));

    expect(executeTool.mock.calls[0][0]).toBe('find_file');
    expect(executeTool.mock.calls[0][1]).toEqual({ name: 'Agent' });
  });

  it('fails the step when neither the call nor the plan names a tool', async () => {
    const inst = makeAgent([{ functionCall: { args: {} } }]);
    const executeTool = vi.spyOn(inst, 'executeTool');

    const result = await inst.executorNode(stateFor(makePlan([{}])));

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.plan.status).toBe('failed');
    expect(result.plan.steps[0].status).toBe('failed');
  });
});

describe('executorNode — The Judge scores failures as failures', () => {
  it('marks the step FAILED when the tool throws', async () => {
    const inst = makeAgent(toolCall('search_text', { query: 'x' }));
    vi.spyOn(inst, 'executeTool').mockRejectedValue(new Error('Buffer is not defined'));

    const plan = makePlan([{ tool: 'search_text' }, { tool: 'find_file' }]);
    const result = await inst.executorNode(stateFor(plan));

    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.plan.steps[0].result).toContain('Buffer is not defined');
    expect(result.plan.status).toBe('failed');
    expect(result.plan.activeStepIndex).toBe(0); // must not advance past a failure
    expect(result.lastError).toContain('Buffer is not defined');
  });

  it('still marks the step completed on a genuine [Exit Code: 0] result', async () => {
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'ls', args: [] }));
    vi.spyOn(inst, 'executeTool').mockResolvedValue('src\ntests\n[Exit Code: 0]');

    const plan = makePlan([{ tool: 'run_terminal_command' }, { tool: 'find_file' }]);
    const result = await inst.executorNode(stateFor(plan));

    expect(result.plan.steps[0].status).toBe('completed');
    expect(result.plan.activeStepIndex).toBe(1);
    expect(result.plan.status).toBe('executing');
    expect(result.lastError).toBeUndefined();
  });

  it('still marks the step failed on a non-zero [Exit Code: N] result', async () => {
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'ls', args: ['missing'] }));
    vi.spyOn(inst, 'executeTool').mockResolvedValue('No such file\n[Exit Code: 2]');

    const plan = makePlan([{ tool: 'run_terminal_command' }, { tool: 'find_file' }]);
    const result = await inst.executorNode(stateFor(plan));

    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.plan.status).toBe('failed');
    expect(result.plan.activeStepIndex).toBe(0);
    expect(result.lastError).toContain('[Exit Code: 2]');
  });

  it('treats a clean return with no exit-code marker as success (UI tools)', async () => {
    const inst = makeAgent(toolCall('change_tab', { tab_name: 'files' }));
    vi.spyOn(inst, 'executeTool').mockResolvedValue('Switched tab to files');

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'change_tab' }])));

    expect(result.plan.steps[0].status).toBe('completed');
    expect(result.plan.status).toBe('completed');
  });

  it('marks the step FAILED when the command times out, not completed', async () => {
    // The 15s safety timer in executeCommandAndWait resolves (never throws) with this
    // exact marker string so partial output survives. Without the Fix-1 check in
    // runTool, a resolved string with no [Exit Code: N] marker reads as success
    // (same rule that makes UI tools like change_tab above pass with no marker at all).
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'ls', args: ['-la'] }));
    vi.spyOn(inst, 'executeTool').mockResolvedValue('partial output...\n[Error: Command timed out after 15000ms]');

    const plan = makePlan([{ tool: 'run_terminal_command' }, { tool: 'find_file' }]);
    const result = await inst.executorNode(stateFor(plan));

    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.plan.status).toBe('failed');
    expect(result.plan.activeStepIndex).toBe(0);
  });
});

describe('executorNode — the Gatekeeper now sees real arguments', () => {
  it('runs a read-only command (ls) without asking for approval', async () => {
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'ls', args: ['-la', 'src'] }));
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('src\n');
    const approvals = captureApprovals();

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));
    approvals.unsubscribe();

    expect(result.pendingAction).toBeUndefined();
    expect(executeTool).toHaveBeenCalledWith('run_terminal_command', { command: 'ls', args: ['-la', 'src'] }, { title: 'PR' });
    expect(approvals.seen).toHaveLength(0);
  });

  it('gates a mutating command and shows the real args in the approval request', async () => {
    const args = { command: 'rm', args: ['-rf', 'node_modules'] };
    const inst = makeAgent(toolCall('run_terminal_command', args));
    const executeTool = vi.spyOn(inst, 'executeTool');
    const approvals = captureApprovals();

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));
    approvals.unsubscribe();

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.pendingAction.tool).toBe('run_terminal_command');
    expect(result.pendingAction.args).toEqual(args);
    // What the user is shown is exactly what the pending action will execute.
    expect(approvals.seen).toHaveLength(1);
    expect(approvals.seen[0].payload).toEqual({ tool: 'run_terminal_command', args });
  });

  it('gates write_file regardless of its arguments', async () => {
    const args = { path: 'src/index.ts', content: 'wiped' };
    const inst = makeAgent(toolCall('write_file', args));
    const executeTool = vi.spyOn(inst, 'executeTool');

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'write_file' }])));

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.pendingAction.args).toEqual(args);
  });

  it('re-gates find when its arguments can execute or delete', async () => {
    const cases = [
      { command: 'find', args: ['.', '-exec', 'rm', '{}', ';'] },
      { command: 'find', args: ['.', '-delete'] },
    ];

    for (const args of cases) {
      const inst = makeAgent(toolCall('run_terminal_command', args));
      const executeTool = vi.spyOn(inst, 'executeTool');

      const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));

      expect(executeTool).not.toHaveBeenCalled();
      expect(result.pendingAction.args).toEqual(args);
    }
  });

  it('allows a plain find that only lists files', async () => {
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'find', args: ['.', '-name', '*.ts'] }));
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('./src/a.ts\n');

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));

    expect(result.pendingAction).toBeUndefined();
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('re-gates find when it uses a write primitive missing from the old denylist', async () => {
    // -fprintf writes to a file and was never in the old MUTATING_ARG_FLAGS regex
    // (exec/execdir/ok/okdir/delete only) — it would have slipped through as "read-only".
    const args = { command: 'find', args: ['.', '-fprintf', '/tmp/out', '%p\\n'] };
    const inst = makeAgent(toolCall('run_terminal_command', args));
    const executeTool = vi.spyOn(inst, 'executeTool');

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.pendingAction.args).toEqual(args);
  });

  it('fails closed when run_terminal_command args.args is not an array', async () => {
    // Previously a non-array `args.args` fell back to `[]` inside isReadOnlyInvocation,
    // skipping the mutating-flag scan entirely and reading as read-only.
    const inst = makeAgent(toolCall('run_terminal_command', { command: 'ls', args: '-la' }));
    const executeTool = vi.spyOn(inst, 'executeTool');
    const approvals = captureApprovals();

    const result = await inst.executorNode(stateFor(makePlan([{ tool: 'run_terminal_command' }])));
    approvals.unsubscribe();

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction.tool).toBe('run_terminal_command');
    expect(approvals.seen).toHaveLength(1);
  });
});

describe('resolvePendingAction — the approved args are the executed args', () => {
  function agentWithPending(args: any): any {
    const inst = new TheiaAgent() as any;
    inst.state = {
      messages: [{ role: 'user', content: 'clean the workspace' }],
      context: null,
      prData: { title: 'PR' },
      plan: makePlan([{ tool: 'run_terminal_command' }, { tool: 'find_file' }]),
      pendingAction: { tool: 'run_terminal_command', args, rationale: 'needs approval' },
    };
    return inst;
  }

  it('executes exactly the tool and arguments held in the pending action', async () => {
    const args = { command: 'npm', args: ['test'] };
    const inst = agentWithPending(args);
    const executeTool = vi.spyOn(inst, 'executeTool').mockResolvedValue('2 passing');
    const processSpy = vi.spyOn(inst, 'process').mockResolvedValue(undefined);

    await inst.resolvePendingAction(true);

    expect(executeTool).toHaveBeenCalledWith('run_terminal_command', args, { title: 'PR' });
    const overrides = processSpy.mock.calls[0][3] as any;
    expect(overrides.plan.steps[0].status).toBe('completed');
    expect(overrides.plan.activeStepIndex).toBe(1);
    expect(overrides.pendingAction).toBeUndefined();
  });

  it('marks the step FAILED when the approved tool throws', async () => {
    const inst = agentWithPending({ command: 'npm', args: ['test'] });
    vi.spyOn(inst, 'executeTool').mockRejectedValue(new Error('Buffer is not defined'));
    const processSpy = vi.spyOn(inst, 'process').mockResolvedValue(undefined);

    await inst.resolvePendingAction(true);

    const overrides = processSpy.mock.calls[0][3] as any;
    expect(overrides.plan.steps[0].status).toBe('failed');
    expect(overrides.plan.status).toBe('failed');
    expect(overrides.plan.activeStepIndex).toBe(0);
    expect(overrides.lastError).toContain('Buffer is not defined');
  });

  it('marks the step FAILED on a non-zero exit code, and completed on zero', async () => {
    const failing = agentWithPending({ command: 'npm', args: ['test'] });
    vi.spyOn(failing, 'executeTool').mockResolvedValue('1 failing\n[Exit Code: 1]');
    const failingProcess = vi.spyOn(failing, 'process').mockResolvedValue(undefined);
    await failing.resolvePendingAction(true);
    expect((failingProcess.mock.calls[0][3] as any).plan.steps[0].status).toBe('failed');

    const passing = agentWithPending({ command: 'npm', args: ['test'] });
    vi.spyOn(passing, 'executeTool').mockResolvedValue('all good\n[Exit Code: 0]');
    const passingProcess = vi.spyOn(passing, 'process').mockResolvedValue(undefined);
    await passing.resolvePendingAction(true);
    expect((passingProcess.mock.calls[0][3] as any).plan.steps[0].status).toBe('completed');
  });
});
