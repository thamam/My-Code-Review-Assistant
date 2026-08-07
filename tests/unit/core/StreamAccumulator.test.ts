import { describe, it, expect } from 'vitest';
import { applyAgentSpeak } from '../../../src/lib/chat/applyAgentSpeak';
import type { ChatMessage } from '../../../types';

describe('applyAgentSpeak', () => {
  it('appends with the legacy ai-<id>-<ts> id when messageId is absent (agent-path regression lock)', () => {
    const result = applyAgentSpeak([], { text: 'Hello' }, { id: 'evt_1', timestamp: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'ai-evt_1-1000', role: 'assistant', content: 'Hello', timestamp: 1000 });
  });

  it('appends a fresh message when a new messageId is seen for the first time', () => {
    const result = applyAgentSpeak([], { messageId: 'simple-1', text: 'partial', isStreaming: true }, { id: 'evt_1', timestamp: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'simple-1', role: 'assistant', content: 'partial' });
  });

  it('collapses three cumulative partials + a final on one messageId into exactly one message', () => {
    let messages: ChatMessage[] = [];
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'Hel', isStreaming: true }, { id: 'evt_1', timestamp: 1000 });
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'Hello wor', isStreaming: true }, { id: 'evt_2', timestamp: 1001 });
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'Hello world', isStreaming: true }, { id: 'evt_3', timestamp: 1002 });
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'Hello world!', isFinal: true }, { id: 'evt_4', timestamp: 1003 });

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello world!');
  });

  it('preserves groundingChunks attached on the final when a later chunk-less event arrives', () => {
    let messages: ChatMessage[] = [];
    const chunks = [{ web: { uri: 'https://a.com', title: 'A' } }];
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'answer', isFinal: true, groundingChunks: chunks }, { id: 'evt_1', timestamp: 1000 });
    expect(messages[0].groundingChunks).toEqual(chunks);

    // A later chunk-less event on the same id must not erase them.
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'answer (edited)' }, { id: 'evt_2', timestamp: 1001 });
    expect(messages[0].groundingChunks).toEqual(chunks);
    expect(messages[0].content).toBe('answer (edited)');
  });

  it('does not mutate the input array; unrelated messages keep position and identity', () => {
    const other: ChatMessage = { id: 'user-1', role: 'user', content: 'hi', timestamp: 500 };
    const original: ChatMessage[] = [other];
    const originalCopy = [...original];

    const result = applyAgentSpeak(original, { messageId: 'simple-1', text: 'hello' }, { id: 'evt_1', timestamp: 1000 });

    expect(original).toEqual(originalCopy);
    expect(result).not.toBe(original);
    expect(result[0]).toBe(other);
    expect(result).toHaveLength(2);
  });

  it('keeps an interleaved agent-path event (no messageId) as a distinct message from a simple stream', () => {
    let messages: ChatMessage[] = [];
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'partial', isStreaming: true }, { id: 'evt_1', timestamp: 1000 });
    messages = applyAgentSpeak(messages, { text: 'legacy agent message' }, { id: 'evt_2', timestamp: 1001 });

    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('simple-1');
    expect(messages[1].id).toBe('ai-evt_2-1001');
  });

  it('preserves the original timestamp on upsert (stable sort)', () => {
    let messages: ChatMessage[] = [];
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'a' }, { id: 'evt_1', timestamp: 1000 });
    messages = applyAgentSpeak(messages, { messageId: 'simple-1', text: 'ab' }, { id: 'evt_2', timestamp: 2000 });
    expect(messages[0].timestamp).toBe(1000);
  });

  it('falls back to payload.content when payload.text is absent', () => {
    const result = applyAgentSpeak([], { content: 'legacy content field' }, { id: 'evt_1', timestamp: 1000 });
    expect(result[0].content).toBe('legacy content field');
  });
});
