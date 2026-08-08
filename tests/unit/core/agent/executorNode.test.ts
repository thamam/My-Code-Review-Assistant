import { describe, it, expect, vi } from 'vitest';
import { eventBus } from '../../../../src/modules/core/EventBus';
import { runExecutorNode, type ExecutorRuntime } from '../../../../src/modules/core/agent/executorNode';
import type { AgentState } from '../../../../src/modules/core/agent/types';
import type { AgentPlan, PlanStep } from '../../../../src/modules/planner/types';

/**
 * runExecutorNode is exercised through the pure `(state, runtime)` contract — no
 * TheiaAgent instance involved — proving the Concern 3 split: the Executor needs
 * nothing from the Planner beyond the plan object already sitting in AgentState,
 * and nothing from TheiaAgent beyond the small ExecutorRuntime
 * (ai/model/getModelConfig/runTool).
 *
 * The full Gatekeeper/Judge matrix already has exhaustive coverage in
 * tests/unit/core/AgentExecutor.test.ts (via TheiaAgent, proving the delegation
 * wiring); these tests instead pin down the runtime contract itself.
 */

function makeRuntime(parts: any[], runTool = vi.fn()): ExecutorRuntime {
  return {
    ai: { models: { generateContent: vi.fn().mockResolvedValue({ candidates: [{ content: { parts } }] }) } } as any,
    model: 'gemini-3.1-pro-preview',
    getModelConfig: vi.fn(() => ({})),
    runTool,
  };
}

const toolCall = (name: string | undefined, args: any) => [{ functionCall: { name, args } }];

function makePlan(steps: Array<Partial<PlanStep>>): AgentPlan {
  return {
    id: 'plan-1',
    goal: 'Investigate',
    steps: steps.map((s, i) => ({ id: `step-${i}`, description: `step ${i}`, status: 'pending' as const, ...s })),
    activeStepIndex: 0,
    status: 'executing',
    generatedAt: 0,
  };
}

const stateFor = (plan: AgentPlan): AgentState => ({
  messages: [{ role: 'user', content: 'go' }],
  context: null,
  prData: { title: 'PR' },
  plan,
});

describe('runExecutorNode — the runtime contract', () => {
  it('passes executorTools to getModelConfig and the active model + suggested tool into the prompt', async () => {
    const runTool = vi.fn().mockResolvedValue({ output: 'ok', ok: true, exitCode: null });
    const runtime = makeRuntime(toolCall('find_file', { name: 'Agent' }), runTool);

    await runExecutorNode(stateFor(makePlan([{ tool: 'find_file' }])), runtime);

    expect(runtime.getModelConfig).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'find_file' })]));
    const call = (runtime.ai.models.generateContent as any).mock.calls[0][0];
    expect(call.model).toBe('gemini-3.1-pro-preview');
    expect(call.config.systemInstruction).toContain('Suggested Tool: find_file');
  });

  it('routes the tool call through runtime.runTool with the resolved name/args/prData', async () => {
    const runTool = vi.fn().mockResolvedValue({ output: 'Found files:\n- Agent.ts', ok: true, exitCode: null });
    const runtime = makeRuntime(toolCall('search_text', { query: 'AgentState' }), runTool);

    const result = await runExecutorNode(stateFor(makePlan([{ tool: 'find_file' }])), runtime);

    expect(runTool).toHaveBeenCalledWith('search_text', { query: 'AgentState' }, { title: 'PR' });
    expect(result.plan?.steps[0].status).toBe('completed');
  });

  it('never calls runTool for a sensitive tool — it pauses with a pendingAction instead', async () => {
    const runTool = vi.fn();
    const runtime = makeRuntime(toolCall('write_file', { path: 'x.ts', content: 'y' }), runTool);

    const result = await runExecutorNode(stateFor(makePlan([{ tool: 'write_file' }])), runtime);

    expect(runTool).not.toHaveBeenCalled();
    expect(result.pendingAction).toEqual({
      tool: 'write_file',
      args: { path: 'x.ts', content: 'y' },
      rationale: expect.stringContaining('requires user approval'),
    });
  });

  it('is a pure function of (state, runtime) — two calls with fresh runtimes never share state', async () => {
    const runtimeA = makeRuntime(toolCall('find_file', { name: 'A' }), vi.fn().mockResolvedValue({ output: 'a', ok: true, exitCode: null }));
    const runtimeB = makeRuntime(toolCall('find_file', { name: 'B' }), vi.fn().mockResolvedValue({ output: 'b', ok: true, exitCode: null }));

    await Promise.all([
      runExecutorNode(stateFor(makePlan([{ tool: 'find_file' }])), runtimeA),
      runExecutorNode(stateFor(makePlan([{ tool: 'find_file' }])), runtimeB),
    ]);

    expect(runtimeA.runTool).toHaveBeenCalledWith('find_file', { name: 'A' }, { title: 'PR' });
    expect(runtimeB.runTool).toHaveBeenCalledWith('find_file', { name: 'B' }, { title: 'PR' });
  });
});

describe('runExecutorNode — plan-object contract with the Planner', () => {
  it('marks the plan completed once the last step succeeds, without needing plannerNode at all', async () => {
    const runTool = vi.fn().mockResolvedValue({ output: 'done', ok: true, exitCode: null });
    const runtime = makeRuntime(toolCall('change_tab', { tab_name: 'files' }), runTool);

    const result = await runExecutorNode(stateFor(makePlan([{ tool: 'change_tab' }])), runtime);

    expect(result.plan?.status).toBe('completed');
    expect(result.plan?.activeStepIndex).toBe(1);
  });

  it('reports API failures as a failed plan + lastError, using only the injected ai client', async () => {
    const runtime: ExecutorRuntime = {
      ai: { models: { generateContent: vi.fn().mockRejectedValue(new Error('quota exceeded')) } } as any,
      model: 'x',
      getModelConfig: vi.fn(() => ({})),
      runTool: vi.fn(),
    };
    const speak: any[] = [];
    const unsub = eventBus.subscribe('AGENT_SPEAK' as any, (e: any) => speak.push(e.event));

    const result = await runExecutorNode(stateFor(makePlan([{ tool: 'find_file' }])), runtime);
    unsub();

    expect(result.plan?.status).toBe('failed');
    expect(result.lastError).toContain('quota exceeded');
    expect(speak.some(e => e.payload.text.includes('API Error'))).toBe(true);
  });
});
