/**
 * src/modules/core/agent/dualTrack.ts
 * FR-038: Dual-Track Protocol (Voice-First).
 * The "News Anchor" pattern: voice track for TTS, screen track for UI.
 *
 * Extracted from Agent.ts (Stage F) — shared by TheiaAgent itself and by the
 * planner/executor nodes, none of which needed to own this formatting logic.
 */
import { sanitizeForVoice } from "../../../utils/VoiceUtils";

export interface DualTrackResponse {
  voice: string;  // Spoken summary - NO code, NO markdown, natural English only
  screen: string; // Visual detail - Markdown, Code, Mermaid diagrams
}

/**
 * Formats a message into Dual-Track JSON format.
 * Voice track is sanitized for TTS (no code, no special chars).
 * Screen track retains full markdown/code formatting.
 */
export function formatDualTrack(voice: string, screen?: string): string {
  const cleanVoice = sanitizeForVoice(voice).substring(0, 200); // Max 2 sentences (~200 chars)

  const response: DualTrackResponse = {
    voice: cleanVoice || 'Action completed.',
    screen: screen || voice
  };
  return JSON.stringify(response);
}
