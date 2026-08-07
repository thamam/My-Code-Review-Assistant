import { describe, it, expect, afterEach } from 'vitest';
import { agent } from '../../../src/modules/core/Agent';

// Access private method via 'any' casting for testing purposes
const agentAny = agent as any;

describe('Agent getModelConfig (search grounding)', () => {
  const originalModel = agentAny.model;

  afterEach(() => {
    agentAny.model = originalModel;
  });

  it('includes the googleSearch tool for the flash model when search is allowed (executor path)', () => {
    agentAny.model = 'gemini-3-flash-preview';
    const config = agentAny.getModelConfig([{ name: 'dummy_tool' }], true);
    expect(config.tools).toContainEqual({ googleSearch: {} });
  });

  it('omits the googleSearch tool when search is not allowed (planner path)', () => {
    agentAny.model = 'gemini-3-flash-preview';
    const config = agentAny.getModelConfig([{ name: 'dummy_tool' }], false);
    expect(config.tools).not.toContainEqual({ googleSearch: {} });
  });

  it('omits the googleSearch tool for non-flash models even when search is allowed', () => {
    agentAny.model = 'gemini-3.1-pro-preview';
    const config = agentAny.getModelConfig([{ name: 'dummy_tool' }], true);
    expect(config.tools).not.toContainEqual({ googleSearch: {} });
  });
});
