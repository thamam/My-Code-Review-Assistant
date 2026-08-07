/**
 * BrainService
 *
 * One-shot deep-insight analysis for the "Brain-to-Voice" bridge: while a live
 * voice session is active, focusing a new file triggers a single Gemini Flash
 * call whose concise analysis is whispered into the live session so spoken
 * answers are instant and informed.
 *
 * Design decisions:
 * - One-shot call (not a persistent chat), separate from DirectorService's
 *   structured ContextBrief generation.
 * - Fail silently on errors (don't interrupt the live session).
 */

import { GoogleGenAI } from "@google/genai";

const BRAIN_SYSTEM_INSTRUCTION = "You are the 'Brain' of Theia. Your job is to analyze code deeply and provide concise, staff-level insights to the 'Voice' (a faster, conversational model). Do not address the user directly. Output only the analysis.";

/** Pure prompt-assembly seam, exported for unit testing without hitting the network. */
export function buildDeepInsightPrompt(filePath: string, content: string): string {
    return `File: ${filePath}\nContent:\n${content}\n\nTASK: Analyze this file's changes for potential bugs, security issues, or architectural impact. Be extremely concise.`;
}

/**
 * Generates a concise deep-insight analysis of a file using Gemini Flash.
 * Returns null on any error, missing API key, or empty content (fail silently).
 */
export async function generateDeepInsight(filePath: string, content: string): Promise<string | null> {
    if (!content) return null;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[Brain] No API key available');
        return null;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: buildDeepInsightPrompt(filePath, content),
            config: {
                systemInstruction: BRAIN_SYSTEM_INSTRUCTION,
            },
        });

        return response.text || null;
    } catch (error) {
        console.warn('[Brain] Failed to generate deep insight:', error);
        return null;
    }
}
