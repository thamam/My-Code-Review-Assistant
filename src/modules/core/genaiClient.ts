/**
 * src/modules/core/genaiClient.ts
 * Single lazily-constructed GoogleGenAI client, reading the API key once.
 * Prevents divergent key reads across Agent.ts, SimpleChat.ts, BrainService.ts, etc.
 */
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  }
  return client;
}
