import { describe, it, expect, vi } from 'vitest';
import { TheiaAgent } from '../../../src/modules/core/Agent';
import { eventBus } from '../../../src/modules/core/EventBus';

/**
 * TheiaAgent.plannerNode — wiring gate.
 *
 * plannerNode.test.ts (tests/unit/core/agent/plannerNode.test.ts) proves
 * `runPlannerNode(state, runtime)` is correct in isolation, but never
 * exercises it through a TheiaAgent instance. That left the seam between
 * `TheiaAgent.plannerNode` (Agent.ts) and `runPlannerNode` unverified: the
 * delegator's body could be replaced with `return { plan: undefined }` and
 * every existing suite would stay green (see Stage F blocking finding —
 * "Planner delegation is completely unverified").
 *
 * This file exercises `TheiaAgent.plannerNode` directly (bypassing the
 * LangGraph edges, same pattern as tests/unit/core/AgentExecutor.test.ts
 * does for `executorNode`), so a broken delegation call fails here.
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

const submitPlanCall = (goal: string, steps: Array<{ description: string; tool?: string }>) => [
  { functionCall: { name: 'submit_plan', args: { goal, steps } } },
];

const stateFor = (overrides: any = {}) => ({
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

describe('TheiaAgent.plannerNode — delegates to runPlannerNode', () => {
  it('returns a real plan and emits AGENT_PLAN_CREATED when invoked through the TheiaAgent instance', async () => {
    const inst = makeAgent(submitPlanCall('Fix it', [
      { description: 'Reproduce' },
      { description: 'Patch', tool: 'write_file' },
    ]));
    const planCreated = captureEvents('AGENT_PLAN_CREATED');

    const result = await inst.plannerNode(stateFor());
    planCreated.unsubscribe();

    // Would be `{ plan: undefined }` if TheiaAgent.plannerNode stopped
    // calling runPlannerNode and returned a stub instead.
    expect(result.plan).toBeDefined();
    expect(result.plan.goal).toBe('Fix it');
    expect(result.plan.status).toBe('executing');
    expect(result.plan.activeStepIndex).toBe(0);
    expect(result.plan.steps).toEqual([
      { id: 'step-0', description: 'Reproduce', tool: undefined, status: 'pending' },
      { id: 'step-1', description: 'Patch', tool: 'write_file', status: 'pending' },
    ]);
    expect(inst.ai.models.generateContent).toHaveBeenCalledTimes(1);
    expect(planCreated.seen).toHaveLength(1);
  });

  it('assembles the PlannerRuntime from its own instance state (model, getModelConfig)', async () => {
    const inst = makeAgent(submitPlanCall('g', [{ description: 'd' }]));
    inst.model = 'gemini-planner-wiring-test';
    const getModelConfig = vi.spyOn(inst, 'getModelConfig');

    await inst.plannerNode(stateFor());

    expect(inst.ai.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-planner-wiring-test' })
    );
    expect(getModelConfig).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'submit_plan' })])
    );
  });
});
