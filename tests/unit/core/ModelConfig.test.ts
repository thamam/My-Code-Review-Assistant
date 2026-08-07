import { describe, it, expect, afterEach } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import { agent } from '../../../src/modules/core/Agent';

// Access private method via 'any' casting for testing purposes
const agentAny = agent as any;

describe('Agent getModelConfig', () => {
  const originalModel = agentAny.model;

  afterEach(() => {
    agentAny.model = originalModel;
  });

  it('never includes a googleSearch tool, for any model (grounding removed from executor path)', () => {
    agentAny.model = 'gemini-3-flash-preview';
    const flashConfig = agentAny.getModelConfig([{ name: 'dummy_tool' }]);
    expect(flashConfig.tools).not.toContainEqual({ googleSearch: {} });

    agentAny.model = 'gemini-3.1-pro-preview';
    const proConfig = agentAny.getModelConfig([{ name: 'dummy_tool' }]);
    expect(proConfig.tools).not.toContainEqual({ googleSearch: {} });
  });

  it('sets thinkingLevel HIGH for the pro model', () => {
    agentAny.model = 'gemini-3.1-pro-preview';
    const config = agentAny.getModelConfig();
    expect(config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
  });

  it('omits thinkingConfig for the flash model', () => {
    agentAny.model = 'gemini-3-flash-preview';
    const config = agentAny.getModelConfig();
    expect(config.thinkingConfig).toBeUndefined();
  });
});
