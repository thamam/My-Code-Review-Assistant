import { describe, it, expect, beforeEach } from 'vitest';
import { simpleChat } from '../../../src/modules/core/SimpleChat';
import type { ChatMessage } from '../../../types';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'user',
    content: 'hi',
    timestamp: 0,
    ...overrides,
  };
}

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
