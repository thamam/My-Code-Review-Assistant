/**
 * src/modules/core/SimpleChat.ts
 * The second brain: a fast, streaming, tools-free chat engine.
 *
 * Subscribes to the same USER_MESSAGE event as TheiaAgent, gated by the
 * `engine` payload flag (default 'simple' — see types.ts). Owns a single
 * `ai.chats.create` session for multi-turn memory, streams responses via
 * `sendMessageStream`, and republishes deltas as ordinary AGENT_SPEAK
 * events carrying a stable `messageId` + `isStreaming`/`isFinal` so
 * ChatContext's `applyAgentSpeak` reducer upserts one growing bubble.
 *
 * Google Search grounding runs only here (never on the agent path) since
 * no `functionDeclarations` are ever passed — no tool-selection conflict.
 */
import type { Chat } from '@google/genai';
import { eventBus } from './EventBus';
import { getGenAI } from './genaiClient';
import { buildContextEnvelope } from '../../prompts/contextEnvelope';
import { buildSystemPrompt } from '../../prompts/systemPrompt';
import { buildSimpleChatConfig, buildSessionKey, mergeGroundingChunks, describeChatError } from './simpleChatConfig';
import type { GroundingChunk } from '../../../types';

export interface SimpleTurn {
  role: 'user' | 'model';
  text: string;
}

class SimpleChatService {
  private session: Chat | null = null;
  private sessionKey: string | null = null;
  private transcript: SimpleTurn[] = [];
  private isBusy: boolean = false;

  constructor() {
    eventBus.subscribe('USER_MESSAGE', async (envelope) => {
      const event = envelope.event;
      if (event.type !== 'USER_MESSAGE') return;

      // Routing guard: absent engine ⇒ 'simple' (safe default). If this
      // guard is ever dropped, both brains answer the same message.
      const engine = event.payload.engine ?? 'simple';
      if (engine !== 'simple') return;

      await this.runTurn(event.payload);
    });

    eventBus.subscribe('SESSION_RESET', () => {
      this.reset();
    });
  }

  /** Called by ChatContext on PR history restore, mirroring agent.loadSession(). */
  public hydrate(turns: SimpleTurn[]): void {
    this.transcript = [...turns];
    // Force session recreation on the next turn so the hydrated transcript
    // is actually baked into the new session's history.
    this.session = null;
    this.sessionKey = null;
  }

  /** Drops both the session and the in-memory transcript. */
  public reset(): void {
    this.session = null;
    this.sessionKey = null;
    this.transcript = [];
  }

  /** Observability/tests — returns a copy, never the live array. */
  public getTranscript(): SimpleTurn[] {
    return [...this.transcript];
  }

  /** Polls until the current turn (if any) finishes. Mirrors Agent.ts. */
  private async waitUntilIdle(): Promise<void> {
    while (this.isBusy) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  private async runTurn(payload: {
    content?: string;
    text?: string;
    context?: any;
    prData?: any;
    model?: string;
    language?: 'English' | 'Hebrew' | 'Auto';
  }): Promise<void> {
    if (this.isBusy) {
      await this.waitUntilIdle();
    }
    this.isBusy = true;

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
      const key = buildSessionKey({
        prId: prData?.id ?? null,
        model,
        appMode: context?.appMode ?? null,
        customReviewGoal: context?.customReviewGoal ?? null,
        language: language ?? null,
      });

      if (key !== this.sessionKey || !this.session) {
        const systemInstruction = buildSystemPrompt({ context, prData, engine: 'simple', language });
        const history = this.transcript.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] }));

        this.session = getGenAI().chats.create({
          model,
          config: buildSimpleChatConfig(model, systemInstruction),
          history,
        });
        this.sessionKey = key;
      }

      const envelopedMessage = buildContextEnvelope(rawMessage, context);
      this.transcript.push({ role: 'user', text: rawMessage });

      const stream = await this.session.sendMessageStream({ message: envelopedMessage });

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
      this.transcript.push({ role: 'model', text: fullText });

    } catch (error: any) {
      console.error('[SimpleChat] Turn failed:', error);
      const friendly = describeChatError(error);
      eventBus.emit({
        type: 'AGENT_SPEAK',
        payload: {
          messageId,
          text: `${fullText}\n\n⚠️ **${friendly}**`,
          isStreaming: false,
          isFinal: true,
        },
      });
    } finally {
      this.isBusy = false;
      eventBus.emit({
        type: 'AGENT_THINKING',
        payload: { stage: 'completed', timestamp: Date.now() },
      });
    }
  }
}

export const simpleChat = new SimpleChatService();
