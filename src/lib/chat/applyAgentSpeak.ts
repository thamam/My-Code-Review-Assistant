/**
 * src/lib/chat/applyAgentSpeak.ts
 * Pure reducer: folds an AGENT_SPEAK payload into the chat message list.
 *
 * Legacy (agent path, no messageId): always appends a new message with the
 * `ai-${envelope.id}-${envelope.timestamp}` id — bit-identical to the old
 * inline ChatContext handler.
 *
 * Streaming (simple path, stable messageId): first event for that id
 * appends; subsequent events upsert in place with cumulative content, so a
 * growing partial reads as one bubble instead of N.
 */
import type { ChatMessage } from '../../types/domain';
import type { AgentSpeakEvent } from '../../modules/core/types';

export function applyAgentSpeak(
  messages: ChatMessage[],
  payload: AgentSpeakEvent['payload'],
  envelope: { id: string; timestamp: number },
): ChatMessage[] {
  const content = payload.text ?? payload.content ?? '';
  const id = payload.messageId ?? `ai-${envelope.id}-${envelope.timestamp}`;

  const idx = messages.findIndex(m => m.id === id);

  if (idx === -1) {
    const newMessage: ChatMessage = {
      id,
      role: 'assistant',
      content,
      timestamp: envelope.timestamp,
      ...(payload.groundingChunks?.length ? { groundingChunks: payload.groundingChunks } : {}),
    };
    return [...messages, newMessage];
  }

  const existing = messages[idx];
  const updated: ChatMessage = {
    ...existing,
    content,
    // A chunk-less partial must not erase grounding chunks already attached.
    ...(payload.groundingChunks?.length ? { groundingChunks: payload.groundingChunks } : {}),
  };

  const copy = [...messages];
  copy[idx] = updated;
  return copy;
}
