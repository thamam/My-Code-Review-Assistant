import { describe, it, expect } from 'vitest';
import {
  SEARCH_GROUNDED_MODELS,
  buildSimpleChatConfig,
  buildTranscriptUpdate,
  mergeGroundingChunks,
  describeChatError,
} from '../../../src/modules/core/simpleChatConfig';

describe('SEARCH_GROUNDED_MODELS / buildSimpleChatConfig', () => {
  it('enables googleSearch for gemini-3-flash-preview', () => {
    const config = buildSimpleChatConfig('gemini-3-flash-preview', 'sys');
    expect(config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('enables googleSearch for gemini-3.1-pro-preview', () => {
    const config = buildSimpleChatConfig('gemini-3.1-pro-preview', 'sys');
    expect(config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('does not enable googleSearch for gemini-2.5-flash-lite (Fastest tier)', () => {
    const config = buildSimpleChatConfig('gemini-2.5-flash-lite', 'sys');
    expect(config.tools).toBeUndefined();
    expect(SEARCH_GROUNDED_MODELS.has('gemini-2.5-flash-lite')).toBe(false);
  });

  it('never includes functionDeclarations', () => {
    const config = buildSimpleChatConfig('gemini-3.1-pro-preview', 'sys') as any;
    expect(config.tools?.[0]?.functionDeclarations).toBeUndefined();
  });

  it('never includes thinkingConfig, even for pro (latency invariant)', () => {
    const config = buildSimpleChatConfig('gemini-3.1-pro-preview', 'sys');
    expect(config.thinkingConfig).toBeUndefined();
  });

  it('carries the systemInstruction through unchanged', () => {
    const config = buildSimpleChatConfig('gemini-2.5-flash-lite', 'You are Theia');
    expect(config.systemInstruction).toBe('You are Theia');
  });
});

describe('buildTranscriptUpdate', () => {
  it('pushes a user+model pair together when the turn produced text', () => {
    expect(buildTranscriptUpdate('hi', 'hello there')).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'model', text: 'hello there' },
    ]);
  });

  it('pushes nothing when the final text is empty (safety block / empty candidate)', () => {
    expect(buildTranscriptUpdate('hi', '')).toEqual([]);
  });
});

describe('mergeGroundingChunks', () => {
  it('dedupes by web.uri, preserving first-seen order', () => {
    const acc = [{ web: { uri: 'https://a.com', title: 'A' } }];
    const incoming = [
      { web: { uri: 'https://a.com', title: 'A-dup' } },
      { web: { uri: 'https://b.com', title: 'B' } },
    ];
    const merged = mergeGroundingChunks(acc, incoming);
    expect(merged).toEqual([
      { web: { uri: 'https://a.com', title: 'A' } },
      { web: { uri: 'https://b.com', title: 'B' } },
    ]);
  });

  it('tolerates undefined incoming', () => {
    const acc = [{ web: { uri: 'https://a.com', title: 'A' } }];
    expect(mergeGroundingChunks(acc, undefined)).toBe(acc);
  });

  it('tolerates empty array incoming', () => {
    const acc = [{ web: { uri: 'https://a.com', title: 'A' } }];
    expect(mergeGroundingChunks(acc, [])).toBe(acc);
  });

  it('drops chunk-less entries (no web, or web without uri)', () => {
    const merged = mergeGroundingChunks([], [
      {},
      { web: {} },
      { web: { title: 'no uri' } },
      { web: { uri: 'https://c.com', title: 'C' } },
    ] as any);
    expect(merged).toEqual([{ web: { uri: 'https://c.com', title: 'C' } }]);
  });

  it('never mutates the accumulator array', () => {
    const acc = [{ web: { uri: 'https://a.com', title: 'A' } }];
    const snapshot = [...acc];
    mergeGroundingChunks(acc, [{ web: { uri: 'https://b.com', title: 'B' } }]);
    expect(acc).toEqual(snapshot);
  });
});

describe('describeChatError', () => {
  it('classifies status 429 as rate-limited', () => {
    expect(describeChatError({ status: 429, message: 'Too Many Requests' }))
      .toContain('Rate limited by the Gemini API');
  });

  it('classifies RESOURCE_EXHAUSTED message as rate-limited', () => {
    expect(describeChatError({ message: 'RESOURCE_EXHAUSTED: quota exceeded' }))
      .toContain('Rate limited by the Gemini API');
  });

  it('classifies status 401 as missing/rejected key', () => {
    expect(describeChatError({ status: 401, message: 'Unauthorized' }))
      .toContain('Gemini API key missing or rejected');
  });

  it('classifies status 403 as missing/rejected key', () => {
    expect(describeChatError({ status: 403, message: 'Forbidden' }))
      .toContain('Gemini API key missing or rejected');
  });

  it('classifies an "API key" message as missing/rejected key', () => {
    expect(describeChatError({ message: 'Invalid API key provided' }))
      .toContain('Gemini API key missing or rejected');
  });

  it('passes through other errors as a generic Chat error', () => {
    expect(describeChatError({ message: 'Network timeout' }))
      .toBe('Chat error: Network timeout');
  });
});
