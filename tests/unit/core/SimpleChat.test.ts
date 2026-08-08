import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { simpleChat } from '../../../src/modules/core/SimpleChat';
import { eventBus } from '../../../src/modules/core/EventBus';
import type { ChatMessage } from '../../../types';

// Hoisted so the vi.mock factory below (itself hoisted above imports by
// vitest) can reference it. Lets tests control exactly what
// generateContentStream yields, without touching the real GoogleGenAI client.
const mockGenerateContentStream = vi.hoisted(() => vi.fn());

vi.mock('../../../src/modules/core/genaiClient', () => ({
  getGenAI: () => ({
    models: { generateContentStream: mockGenerateContentStream },
  }),
}));

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'user',
    content: 'hi',
    timestamp: 0,
    ...overrides,
  };
}

/**
 * A hand-driven async-iterable standing in for the SDK's streaming response.
 * Tests call push()/finish() to control exactly when each chunk (and the
 * end of stream) becomes visible to SimpleChat's `for await` loop, so a
 * reset() can be landed at a precise point mid-stream.
 */
function createControllableStream() {
  const queue: any[] = [];
  const waiters: Array<(result: IteratorResult<any>) => void> = [];
  let finished = false;

  return {
    push(chunk: any) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value: chunk, done: false });
      } else {
        queue.push(chunk);
      }
    },
    finish() {
      finished = true;
      while (waiters.length > 0) {
        waiters.shift()!({ value: undefined, done: true });
      }
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<any>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift(), done: false });
            }
            if (finished) {
              return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise(resolve => { waiters.push(resolve); });
          },
        };
      },
    },
  };
}

/** Flushes the microtask queue so in-flight `await`s inside runTurn settle. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SimpleChat.hydrate', () => {
  beforeEach(() => {
    simpleChat.reset();
  });

  it('maps user/assistant messages into the transcript, assistant becoming "model"', () => {
    simpleChat.hydrate([
      msg({ id: 'u-1', role: 'user', content: 'question' }),
      msg({ id: 'a-1', role: 'assistant', content: 'answer' }),
    ]);
    expect(simpleChat.getTranscript()).toEqual([
      { role: 'user', text: 'question' },
      { role: 'model', text: 'answer' },
    ]);
  });

  it('drops messages whose id starts with "welcome-" (fabricated SESSION_RESET greeting)', () => {
    simpleChat.hydrate([
      msg({ id: 'welcome-123', role: 'assistant', content: 'Welcome!' }),
      msg({ id: 'u-1', role: 'user', content: 'real question' }),
    ]);
    expect(simpleChat.getTranscript()).toEqual([
      { role: 'user', text: 'real question' },
    ]);
  });

  it('drops messages with empty (or whitespace-only) content', () => {
    simpleChat.hydrate([
      msg({ id: 'u-1', role: 'user', content: '' }),
      msg({ id: 'u-2', role: 'user', content: '   ' }),
      msg({ id: 'u-3', role: 'user', content: 'real question' }),
    ]);
    expect(simpleChat.getTranscript()).toEqual([
      { role: 'user', text: 'real question' },
    ]);
  });

  it('drops system/divider messages — only user/assistant become transcript turns', () => {
    simpleChat.hydrate([
      msg({ id: 'sys-1', role: 'system', content: 'Switched to Agent mode.' }),
      msg({ id: 'u-1', role: 'user', content: 'real question' }),
    ]);
    expect(simpleChat.getTranscript()).toEqual([
      { role: 'user', text: 'real question' },
    ]);
  });

  it('reset() clears the transcript', () => {
    simpleChat.hydrate([msg({ id: 'u-1', role: 'user', content: 'question' })]);
    simpleChat.reset();
    expect(simpleChat.getTranscript()).toEqual([]);
  });
});

// NOTE ON COVERAGE: this does not exercise contexts/ChatContext.tsx — isTyping
// is private React state inside that component, and this suite has no React
// harness (vitest.config.ts: environment 'node', no @testing-library/react).
// It cannot be made to fail against the pre-fix ChatContext.tsx (that file
// is what changed; SimpleChat.ts did not). What it does pin down is the
// SimpleChat-side precondition that makes the ChatContext bug possible: reset()
// never emits anything a caller could wait on, so a caller that flips a flag
// on some *other* signal (like AGENT_THINKING) and never clears it on reset()
// itself will have that flag stranded. That's exactly why ChatContext's
// resetChat and PR-load effect now call setIsTyping(false) synchronously next
// to simpleChat.reset(), instead of relying on a completed event to arrive.
describe('SimpleChat.reset — contract the ChatContext isTyping fix depends on', () => {
  it('emits no EventBus event on its own (a caller cannot wait on reset() to resolve UI state)', () => {
    const seen: string[] = [];
    const unsubscribe = eventBus.subscribe('*', (envelope) => { seen.push(envelope.event.type); });

    simpleChat.reset();

    expect(seen).toEqual([]);
    unsubscribe();
  });
});

describe('SimpleChat.runTurn epoch guard (stale-turn cancellation)', () => {
  let speakPayloads: any[];
  let thinkingPayloads: any[];
  let unsubscribe: () => void;

  beforeEach(() => {
    simpleChat.reset();
    mockGenerateContentStream.mockReset();
    speakPayloads = [];
    thinkingPayloads = [];
    unsubscribe = eventBus.subscribe('*', (envelope) => {
      if (envelope.event.type === 'AGENT_SPEAK') speakPayloads.push(envelope.event.payload);
      if (envelope.event.type === 'AGENT_THINKING') thinkingPayloads.push(envelope.event.payload);
    });
  });

  afterEach(() => {
    unsubscribe();
  });

  it('reset() mid-stream stops the stale turn from committing to the transcript or emitting a final AGENT_SPEAK', async () => {
    const { stream, push, finish } = createControllableStream();
    mockGenerateContentStream.mockResolvedValue(stream);

    eventBus.emit({ type: 'USER_MESSAGE', payload: { text: 'hello', engine: 'simple' } });
    await flush(); // runTurn starts, awaits generateContentStream, blocks on the first chunk

    push({ text: 'partial answer' });
    await flush();
    expect(speakPayloads.some(p => p.isStreaming === true)).toBe(true);

    simpleChat.reset(); // simulates loading a new PR mid-stream — bumps epoch

    push({ text: ' the rest of the answer' });
    finish();
    await flush();

    expect(simpleChat.getTranscript()).toEqual([]);
    expect(speakPayloads.some(p => p.isFinal === true)).toBe(false);
  });

  it('a stale turn does not leave a completed AGENT_THINKING that would unstick isTyping for the next session', async () => {
    const { stream, push, finish } = createControllableStream();
    mockGenerateContentStream.mockResolvedValue(stream);

    eventBus.emit({ type: 'USER_MESSAGE', payload: { text: 'hello', engine: 'simple' } });
    await flush();
    expect(thinkingPayloads.some(p => p.stage === 'started')).toBe(true);

    push({ text: 'partial' });
    await flush();

    simpleChat.reset(); // stale turn from here on
    finish(); // stream ends with no further chunks
    await flush();

    expect(thinkingPayloads.some(p => p.stage === 'completed')).toBe(false);
  });

  it('a live (non-stale) turn still commits its answer and emits completed as normal', async () => {
    const { stream, push, finish } = createControllableStream();
    mockGenerateContentStream.mockResolvedValue(stream);

    eventBus.emit({ type: 'USER_MESSAGE', payload: { text: 'hello', engine: 'simple' } });
    await flush();

    push({ text: 'full answer' });
    finish();
    await flush();

    expect(simpleChat.getTranscript()).toEqual([
      { role: 'user', text: 'hello' },
      { role: 'model', text: 'full answer' },
    ]);
    expect(speakPayloads.some(p => p.isFinal === true)).toBe(true);
    expect(thinkingPayloads.some(p => p.stage === 'completed')).toBe(true);
  });
});
