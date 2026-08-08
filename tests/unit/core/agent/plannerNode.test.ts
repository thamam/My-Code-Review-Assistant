import { describe, it, expect, vi } from 'vitest';
import { eventBus } from '../../../../src/modules/core/EventBus';
import { runPlannerNode, type PlannerRuntime } from '../../../../src/modules/core/agent/plannerNode';
import type { AgentState } from '../../../../src/modules/core/agent/types';
import type { AgentPlan } from '../../../../src/modules/planner/types';

/**
 * plannerNode is exercised entirely through the pure `runPlannerNode(state, runtime)`
 * contract — no TheiaAgent instance involved — proving the Concern 3 split: the
 * Planner needs nothing from the Executor, and nothing from TheiaAgent beyond the
 * small PlannerRuntime (ai/model/getModelConfig).
 */

function makeRuntime(parts: any[]): PlannerRuntime {
  return {
    ai: { models: { generateContent: vi.fn().mockResolvedValue({ candidates: [{ content: { parts } }] }) } } as any,
    model: 'gemini-3.1-pro-preview',
    getModelConfig: vi.fn(() => ({})),
  };
}

const submitPlanCall = (goal: string, steps: Array<{ description: string; tool?: string }>) => [
  { functionCall: { name: 'submit_plan', args: { goal, steps } } },
];

const baseState = (overrides: Partial<AgentState> = {}): AgentState => ({
  messages: [{ role: 'user', content: 'Fix the failing test' }],
  context: null,
  prData: { title: 'PR' },
  ...overrides,
});

function captureEvents(type: string) {
  const seen: any[] = [];
  const unsubscribe = eventBus.subscribe(type as any, (e: any) => seen.push(e.event));
  return { seen, unsubscribe };
}

describe('runPlannerNode — building a plan from a submit_plan call', () => {
  it('builds an AgentPlan with pending steps, activeStepIndex 0, status executing', async () => {
    const runtime = makeRuntime(submitPlanCall('Fix it', [{ description: 'Reproduce' }, { description: 'Patch', tool: 'write_file' }]));
    const planCreated = captureEvents('AGENT_PLAN_CREATED');

    const result = await runPlannerNode(baseState(), runtime);
    planCreated.unsubscribe();

    const plan = result.plan as AgentPlan;
    expect(plan.goal).toBe('Fix it');
    expect(plan.activeStepIndex).toBe(0);
    expect(plan.status).toBe('executing');
    expect(plan.steps).toEqual([
      { id: 'step-0', description: 'Reproduce', tool: undefined, status: 'pending' },
      { id: 'step-1', description: 'Patch', tool: 'write_file', status: 'pending' },
    ]);
    expect(result.lastError).toBeUndefined();
    expect(planCreated.seen).toHaveLength(1);
  });

  it('passes plannerTools to getModelConfig and the active model to generateContent', async () => {
    const runtime = makeRuntime(submitPlanCall('g', [{ description: 'd' }]));
    await runPlannerNode(baseState(), runtime);

    expect(runtime.getModelConfig).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'submit_plan' })]));
    expect(runtime.ai.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.1-pro-preview' }));
  });
});

describe('runPlannerNode — repair mode', () => {
  it('emits REPAIR_MODE and includes the failure in the prompt when the incoming plan failed', async () => {
    const runtime = makeRuntime(submitPlanCall('Fix it (retry)', [{ description: 'Diagnose first' }]));
    const repairEvents = captureEvents('REPAIR_MODE');

    const failedPlan: AgentPlan = {
      id: 'plan-1', goal: 'Fix it',
      steps: [{ id: 'step-0', description: 'Run tests', tool: 'run_terminal_command', status: 'failed', result: 'ENOENT' }],
      activeStepIndex: 0, status: 'failed', generatedAt: 0,
    };

    await runPlannerNode(baseState({ plan: failedPlan, lastError: 'ENOENT: file not found' }), runtime);
    repairEvents.unsubscribe();

    expect(repairEvents.seen).toHaveLength(1);
    expect(repairEvents.seen[0].payload).toMatchObject({ originalGoal: 'Fix it', lastError: 'ENOENT: file not found' });

    const sentPrompt = (runtime.ai.models.generateContent as any).mock.calls[0][0];
    expect(sentPrompt.config.systemInstruction).toContain('REPAIR MODE ACTIVE');
    expect(sentPrompt.contents[0].parts[0].text).toContain('REPAIR REQUIRED');
  });
});

describe('runPlannerNode — no submit_plan call (fallback text parsing)', () => {
  it('recovers a plan from fenced JSON text via the greedy parser', async () => {
    const text = '```json\n{"goal":"Recovered","steps":[{"description":"Do it"}]}\n```';
    const runtime = makeRuntime([{ text }]);

    const result = await runPlannerNode(baseState(), runtime);

    expect(result.plan?.goal).toBe('Recovered');
    expect(result.plan?.steps).toHaveLength(1);
    expect(result.plan?.status).toBe('executing');
  });

  it('speaks the raw text and returns no plan when no JSON is recoverable at all', async () => {
    const runtime = makeRuntime([{ text: 'I am not sure how to plan that.' }]);
    const speak = captureEvents('AGENT_SPEAK');

    const result = await runPlannerNode(baseState(), runtime);
    speak.unsubscribe();

    expect(result.plan).toBeUndefined();
    expect(speak.seen).toHaveLength(1);
    expect(JSON.parse(speak.seen[0].payload.text).screen).toBe('I am not sure how to plan that.');
  });
});

describe('runPlannerNode — edge inputs', () => {
  it('returns { plan: undefined } without calling the model when there is no user message', async () => {
    const runtime = makeRuntime([]);
    const result = await runPlannerNode(baseState({ messages: [] }), runtime);

    expect(result).toEqual({ plan: undefined });
    expect(runtime.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('reports lastError when the model returns no response at all', async () => {
    const runtime: PlannerRuntime = {
      ai: { models: { generateContent: vi.fn().mockResolvedValue(undefined) } } as any,
      model: 'x',
      getModelConfig: vi.fn(() => ({})),
    };

    const result = await runPlannerNode(baseState(), runtime);
    expect(result).toEqual({ plan: undefined, lastError: 'No response from AI model' });
  });
});
