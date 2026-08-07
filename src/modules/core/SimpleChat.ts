/**
 * src/modules/core/SimpleChat.ts
 * The second brain: a fast, streaming, tools-free chat engine.
 *
 * Subscribes to the same USER_MESSAGE event as TheiaAgent, gated by the
 * `engine` payload flag (default 'simple' — see types.ts). Every turn is
 * STATELESS at the SDK level: it calls `generateContentStream` fresh with
 * the full transcript replayed as `contents`, rather than holding an
 * `ai.chats.create` session. The transcript (raw, unenveloped text) is the
 * only conversation state SimpleChat keeps — this is what lets model/mode/
 * language change turn-to-turn with no session-rebuild bookkeeping, and
 * what keeps the enveloped (large) per-turn prompt out of history so it
 * can't accumulate across turns.
 *
 * Google Search grounding runs only here (never on the agent path) since
 * no `functionDeclarations` are ever passed — no tool-selection conflict.
 */
import { eventBus } from './EventBus';
import { getGenAI } from './genaiClient';
import { buildContextEnvelope } from '../../prompts/contextEnvelope';
import { buildSystemPrompt } from '../../prompts/systemPrompt';
import { buildSimpleChatConfig, buildTranscriptUpdate, mergeGroundingChunks, describeChatError } from './simpleChatConfig';
import type { SimpleTurn } from './simpleChatConfig';
import type { ChatMessage, GroundingChunk } from '../../../types';

export type { SimpleTurn };

class SimpleChatService {
  private transcript: SimpleTurn[] = [];
  /** FIFO mutex: each turn is chained onto the previous, never overlapping. */
  private turnChain: Promise<void> = Promise.resolve();

  constructor() {
    eventBus.subscribe('USER_MESSAGE', async (envelope) => {
      const event = envelope.event;
      if (event.type !== 'USER_MESSAGE') return;

      // Routing guard: absent/unknown engine ⇒ handled here (safe catch-all
      // default — an unrecognized value must never leave the UI dead). Only
      // an explicit 'agent' flag routes to the other brain. See Agent.ts for
      // the mirror guard, which accepts only 'agent'.
      const engine = event.payload.engine ?? 'simple';
      if (engine === 'agent') return;
      if (engine !== 'simple') {
        console.warn(`[SimpleChat] Unknown engine "${engine}" — handling as simple chat.`);
      }

      this.turnChain = this.turnChain.then(() => this.runTurn(event.payload)).catch(() => {});
    });

    eventBus.subscribe('SESSION_RESET', () => {
      this.reset();
    });
  }

  /**
   * Called by ChatContext on PR history restore, mirroring agent.loadSession().
   * Drops messages with empty content and the fabricated `welcome-*` SESSION_RESET
   * greeting — neither is real model output, and letting either through would
   * break the user/model alternation the stateless turn algorithm relies on.
   */
  public hydrate(messages: ChatMessage[]): void {
    this.transcript = messages
      .filter(m =>
        (m.role === 'user' || m.role === 'assistant') &&
        m.content.trim().length > 0 &&
        !m.id.startsWith('welcome-')
      )
      .map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, text: m.content }));
  }

  /** Drops the in-memory transcript. */
  public reset(): void {
    this.transcript = [];
  }

  /** Observability/tests — returns a copy, never the live array. */
  public getTranscript(): SimpleTurn[] {
    return [...this.transcript];
  }

  private async runTurn(payload: {
    content?: string;
    text?: string;
    context?: any;
    prData?: any;
    model?: string;
    language?: 'English' | 'Hebrew' | 'Auto';
  }): Promise<void> {
    eventBus.emit({
      type: 'AGENT_THINKING',
      payload: { stage: 'started', message: 'Analyzing...', timestamp: Date.now() },
    });

    const rawMessage = payload.content || payload.text || '';
    const context = payload.context ?? null;
    const prData = payload.prData;
    const model = payload.model || 'gemini-3.1-pro-preview';
    const language = payload.language;

    const messageId = `simple-${Date.now()}`;
    let fullText = '';
    let chunks: GroundingChunk[] = [];

    try {
      const systemInstruction = buildSystemPrompt({ context, prData, engine: 'simple', language });
      const envelopedMessage = buildContextEnvelope(rawMessage, context);

      const contents = [
        ...this.transcript.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })),
        { role: 'user' as const, parts: [{ text: envelopedMessage }] },
      ];

      const stream = await getGenAI().models.generateContentStream({
        model,
        contents,
        config: buildSimpleChatConfig(model, systemInstruction),
      });

      for await (const chunk of stream) {
        chunks = mergeGroundingChunks(chunks, chunk.candidates?.[0]?.groundingMetadata?.groundingChunks as any);

        if (chunk.text) {
          fullText += chunk.text;
          eventBus.emit({
            type: 'AGENT_SPEAK',
            payload: { messageId, text: fullText, isStreaming: true, isFinal: false },
          });
        }
      }

      const update = buildTranscriptUpdate(rawMessage, fullText);
      if (update.length) {
        this.transcript.push(...update);
        eventBus.emit({
          type: 'AGENT_SPEAK',
          payload: {
            messageId,
            text: fullText,
            isStreaming: false,
            isFinal: true,
            ...(chunks.length ? { groundingChunks: chunks } : {}),
          },
        });
      } else {
        // Safety block or empty candidate: nothing to commit to the
        // transcript. Surface a notice instead of an empty bubble.
        eventBus.emit({
          type: 'AGENT_SPEAK',
          payload: {
            messageId,
            text: 'The model returned no content — possibly blocked. Try rephrasing.',
            isStreaming: false,
            isFinal: true,
          },
        });
      }

    } catch (error: any) {
      console.error('[SimpleChat] Turn failed:', error);
      const friendly = describeChatError(error);
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: {
          messageId,
          text: fullText ? `${fullText}\n\n⚠️ **${friendly}**` : `⚠️ **${friendly}**`,
          isStreaming: false,
          isFinal: true,
        },
      });
      // Turn never committed to the transcript — the user can retry cleanly.
    } finally {
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() },
      });
    }
  }
}

export const simpleChat = new SimpleChatService();
