/**
 * src/modules/core/simpleChatConfig.ts
 * Pure, side-effect-free helpers for SimpleChat. Unit-test target — no
 * network calls, no EventBus, no GoogleGenAI construction.
 */
import type { GroundingChunk } from '../../../types';

/**
 * Models that get Google Search grounding on the simple-chat path.
 * `gemini-2.5-flash-lite` is deliberately excluded — it's the "Fastest"
 * tier and grounding adds a retrieval round-trip that defeats the point.
 */
export const SEARCH_GROUNDED_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
]);

/**
 * Builds the per-session GenerateContentConfig for SimpleChat.
 * No `thinkingConfig` — extended thinking is the agent path's latency
 * cost, and simple mode exists specifically to avoid it.
 * No `functionDeclarations` — simple mode never calls tools, so grounding
 * (when enabled) never conflicts with tool-selection.
 */
export function buildSimpleChatConfig(model: string, systemInstruction: string): Record<string, unknown> {
  const config: Record<string, unknown> = { systemInstruction };
  if (SEARCH_GROUNDED_MODELS.has(model)) {
    config.tools = [{ googleSearch: {} }];
  }
  return config;
}

export interface SessionKeyParts {
  prId?: string | null;
  model: string;
  appMode?: string | null;
  customReviewGoal?: string | null;
  language?: string | null;
}

/**
 * Builds a session identity key. Every part is baked into either the
 * system instruction or the model itself, so a change in any of them
 * must produce a new `Chat` session (see SimpleChat.ts turn algorithm).
 */
export function buildSessionKey(parts: SessionKeyParts): string {
  return [
    parts.prId ?? '',
    parts.model,
    parts.appMode ?? '',
    parts.customReviewGoal ?? '',
    parts.language ?? '',
  ].join('|');
}

type IncomingGroundingChunk = {
  web?: { uri?: string; title?: string } | null;
} | null | undefined;

/**
 * Dedupes grounding chunks by `web.uri`, preserving first-seen order.
 * Chunks without a usable `web.uri` (maps/retrievedContext chunks, or
 * malformed entries) are dropped — `ChatMessage.tsx` renders web chips only.
 */
export function mergeGroundingChunks(
  acc: GroundingChunk[],
  incoming: IncomingGroundingChunk[] | null | undefined
): GroundingChunk[] {
  if (!incoming || incoming.length === 0) return acc;

  const seen = new Set(acc.map(c => c.web?.uri).filter(Boolean));
  const merged = [...acc];

  for (const chunk of incoming) {
    const uri = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    merged.push({ web: { uri, title: chunk!.web!.title ?? uri } });
  }

  return merged;
}

/**
 * Classifies a caught error into a user-facing message. No retries, no
 * repair mode — SimpleChat surfaces the failure once and stops.
 */
export function describeChatError(error: any): string {
  const status = error?.status;
  const message: string = error?.message || String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
    return 'Rate limited by the Gemini API. Wait a moment and retry, or switch to a lighter model.';
  }
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return 'Gemini API key missing or rejected. Check `VITE_GEMINI_API_KEY`.';
  }
  return `Chat error: ${message}`;
}
