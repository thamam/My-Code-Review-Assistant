import { describe, it, expect } from 'vitest';
import { extractRequirements } from '../../../src/lib/requirements/index';
import type { ParsedSession } from '../../../src/lib/session-parser/types';

function makeSession(prompts: Array<{ index: number; text: string }>): ParsedSession {
  return {
    sessionId: 'test',
    turns: [],
    prompts,
    toolCalls: [],
    toolCallsByCategory: {
      file_read: [], file_write: [], shell: [], task: [], agent: [],
      skill: [], search: [], ui: [], mcp: [], other: [],
    },
    filesRead: [],
    filesWritten: [],
    filesNotRead: [],
    thinkingTraces: [],
    errorSequences: [],
    metadata: { totalTurns: 0, totalToolCalls: 0 },
  };
}

describe('I2 Prompt→Requirements extractor', () => {

  it('extracts a "must" requirement', () => {
    const session = makeSession([{
      index: 0,
      text: 'The function must validate the token before proceeding.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements).toHaveLength(1);
    expect(requirements[0].text).toContain('must validate the token');
    expect(requirements[0].sourcePromptIndex).toBe(0);
  });

  it('extracts a "should" requirement', () => {
    const session = makeSession([{
      index: 1,
      text: 'The handler should return 401 when auth fails.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements[0].text).toContain('should return 401');
  });

  it('extracts a "never" prohibition', () => {
    const session = makeSession([{
      index: 0,
      text: 'Never store plaintext passwords in the database.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements[0].text).toContain('Never store plaintext');
  });

  it('deduplicates identical requirements across prompts', () => {
    const session = makeSession([
      { index: 0, text: 'The endpoint must validate input.' },
      { index: 1, text: 'The endpoint must validate input.' },
    ]);
    const { requirements } = extractRequirements(session);
    expect(requirements).toHaveLength(1);
  });

  it('ignores non-requirement sentences', () => {
    const session = makeSession([{
      index: 0,
      text: 'Here is the auth module. It was refactored last week.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements).toHaveLength(0);
  });

  it('extracts multiple requirements from one prompt', () => {
    const session = makeSession([{
      index: 0,
      text: 'The system must log all errors. It should also retry on timeout. Never swallow exceptions.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for empty session', () => {
    const { requirements } = extractRequirements(makeSession([]));
    expect(requirements).toHaveLength(0);
  });

  it('assigns sequential ids', () => {
    const session = makeSession([{
      index: 0,
      text: 'Must handle errors gracefully. Should log all failures.',
    }]);
    const { requirements } = extractRequirements(session);
    expect(requirements[0].id).toBe('req-1');
    if (requirements.length > 1) expect(requirements[1].id).toBe('req-2');
  });
});
