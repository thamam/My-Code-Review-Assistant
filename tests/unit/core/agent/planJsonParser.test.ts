import { describe, it, expect } from 'vitest';
import { parsePlanFromText, hasStepsArray } from '../../../../src/modules/core/agent/planJsonParser';

describe('parsePlanFromText', () => {
  describe('clean JSON (direct strategy)', () => {
    it('parses a bare JSON object with no wrapping at all', () => {
      const text = '{"goal":"Fix the bug","steps":[{"description":"Reproduce it"}]}';
      const result = parsePlanFromText(text);
      expect(result).toEqual({
        status: 'parsed',
        via: 'direct',
        data: { goal: 'Fix the bug', steps: [{ description: 'Reproduce it' }] },
      });
    });

    it('strips a ```json fenced code block and parses the interior', () => {
      const text = '```json\n{"goal":"Investigate","steps":[{"description":"Check logs"}]}\n```';
      const result = parsePlanFromText(text);
      expect(result.status).toBe('parsed');
      expect(result).toMatchObject({ via: 'direct' });
      expect((result as any).data.goal).toBe('Investigate');
    });

    it('strips a bare ``` fence with no "json" language tag', () => {
      const text = '```\n{"goal":"g","steps":[]}\n```';
      const result = parsePlanFromText(text);
      expect(result.status).toBe('parsed');
      expect((result as any).via).toBe('direct');
    });
  });

  describe('JSON buried in trailing/leading prose (greedy strategy)', () => {
    it('recovers a plan JSON object preceded by explanatory prose', () => {
      const text = 'Sure, here is my plan for fixing this:\n\n{"goal":"Fix it","steps":[{"description":"Step one"}]}';
      const result = parsePlanFromText(text);
      expect(result.status).toBe('parsed');
      expect((result as any).via).toBe('greedy');
      expect((result as any).data.goal).toBe('Fix it');
    });

    it('recovers a plan JSON object followed by trailing prose', () => {
      const text = '{"goal":"Fix it","steps":[{"description":"Step one"}]}\n\nLet me know if you have questions!';
      const result = parsePlanFromText(text);
      expect(result.status).toBe('parsed');
      expect((result as any).via).toBe('greedy');
    });

    it('recovers a plan JSON object surrounded on both sides by prose', () => {
      const text = 'Thinking out loud here...\n{"goal":"g","steps":[{"description":"d"}]}\nDone!';
      const result = parsePlanFromText(text);
      expect(result.status).toBe('parsed');
      expect((result as any).via).toBe('greedy');
    });
  });

  describe('truncated / malformed objects', () => {
    it('reports invalid-json for a truncated object with a matching outer brace but broken interior', () => {
      // The greedy regex still finds a `{...}` span (it runs from the first '{'
      // to the LAST '}' in the text) but the interior is not valid JSON: the
      // array and string are both cut off mid-token.
      const text = '{"goal":"Fix it","steps":[{"description":"Step one truncated hal}';
      const result = parsePlanFromText(text);
      expect(result).toEqual({ status: 'invalid-json' });
    });

    it('reports invalid-json for an object missing its closing braces entirely', () => {
      // No closing '}' at all -> the greedy regex itself finds no match,
      // which is a DIFFERENT outcome (no-json-found) from a found-but-broken span.
      const text = '{"goal":"Fix it","steps":[{"description":"Step one"';
      const result = parsePlanFromText(text);
      expect(result).toEqual({ status: 'no-json-found' });
    });

    it('reports invalid-json for a dangling trailing comma', () => {
      const text = '{"goal":"g","steps":[{"description":"d"},]}';
      const result = parsePlanFromText(text);
      expect(result).toEqual({ status: 'invalid-json' });
    });
  });

  describe('no JSON at all', () => {
    it('reports no-json-found for plain prose with no braces', () => {
      const result = parsePlanFromText('I am not sure how to help with that, could you clarify?');
      expect(result).toEqual({ status: 'no-json-found' });
    });

    it('reports no-json-found for an empty string', () => {
      expect(parsePlanFromText('')).toEqual({ status: 'no-json-found' });
    });
  });

  describe('multiple JSON-like spans', () => {
    it('greedily spans from the first { to the last } when the model babbles two objects', () => {
      // This documents existing (imperfect) behavior: the regex is not
      // "smallest valid object", it is "first { .. last }" — with two separate
      // objects and prose between them, the naive parse fails and this is
      // correctly reported as invalid, not silently mis-parsed.
      const text = '{"a":1} some words {"goal":"g","steps":[]}';
      const result = parsePlanFromText(text);
      expect(result).toEqual({ status: 'invalid-json' });
    });
  });
});

describe('hasStepsArray', () => {
  it('is true for an object with a steps array', () => {
    expect(hasStepsArray({ goal: 'g', steps: [{ description: 'd' }] })).toBe(true);
  });

  it('is true for an object with an empty steps array', () => {
    expect(hasStepsArray({ steps: [] })).toBe(true);
  });

  it('is false when steps is missing', () => {
    expect(hasStepsArray({ goal: 'g' })).toBe(false);
  });

  it('is false when steps is not an array', () => {
    expect(hasStepsArray({ steps: 'not an array' })).toBe(false);
  });

  it('is false for null or undefined', () => {
    expect(hasStepsArray(null)).toBe(false);
    expect(hasStepsArray(undefined)).toBe(false);
  });
});
