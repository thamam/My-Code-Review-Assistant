/**
 * DirectorService
 * 
 * Background service that uses Gemini 1.5 Pro to generate ContextBriefs.
 * The Director analyzes the current file and PR context, producing a structured
 * summary that the Actor (Live voice session) can use for grounded responses.
 * 
 * Design decisions:
 * - One-shot calls (not a persistent chat)
 * - Fail silently on errors (don't interrupt the Actor)
 * - Latest-wins for race conditions
 */

import { GoogleGenAI } from "@google/genai";
import { ContextBrief } from "../types/contextBrief";
import { DIRECTOR_SYSTEM_PROMPT, buildDirectorPrompt } from "../prompts/directorPrompt";

export interface DirectorInput {
    fileContent: string;
    filePath: string;
    prTitle: string;
    prDescription: string;
    linearIssue: { identifier: string; title: string; description: string } | null;
}

/**
 * Generates a ContextBrief using Gemini 1.5 Pro.
 * Returns null on any error (fail silently).
 */
export async function generateBrief(input: DirectorInput): Promise<ContextBrief | null> {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[Director] No API key available');
            return null;
        }

        const ai = new GoogleGenAI({ apiKey });

        console.debug('[Director] Generating brief for:', input.filePath);

        const userPrompt = buildDirectorPrompt(
            input.fileContent,
            input.filePath,
            input.prTitle,
            input.prDescription,
            input.linearIssue
        );

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-pro-latest',
            config: {
                systemInstruction: DIRECTOR_SYSTEM_PROMPT,
                responseMimeType: 'application/json',
            },
            contents: userPrompt,
        });

        const text = response.text;
        if (!text) {
            console.warn('[Director] Empty response from model');
            return null;
        }

        const brief = JSON.parse(text) as ContextBrief;

        // Validate required fields
        if (!brief.generatedAt || !Array.isArray(brief.keyFacts)) {
            console.warn('[Director] Invalid brief structure');
            return null;
        }

        console.debug('[Director] Brief generated successfully:', brief.activeFile?.path);
        return brief;

    } catch (error) {
        // Fail silently - Actor continues with previous context
        console.warn('[Director] Failed to generate brief:', error);
        return null;
    }
}

/**
 * Formats a ContextBrief into a "whisper" string for injection into the Live session.
 * The Actor is instructed to never read this aloud.
 */
export function formatBriefAsWhisper(brief: ContextBrief): string {
    const highlights = brief.activeFile?.highlights
        ?.map(h => `  - Lines ${h.lines}: ${h.reason}`)
        .join('\n') || '  (none)';

    const keyFacts = brief.keyFacts
        .map(f => `- ${f}`)
        .join('\n');

    const topics = brief.suggestedTopics.join(', ');

    let whisper = `[CONTEXT UPDATE - DO NOT READ ALOUD]
You are now looking at: ${brief.activeFile?.path || 'No file'}
Summary: ${brief.activeFile?.summary || 'N/A'}

Key Highlights:
${highlights}

Key Facts:
${keyFacts}

Suggested Topics: ${topics}`;

    if (brief.linearContext) {
        whisper += `

Linear Issue ${brief.linearContext.issueId}: ${brief.linearContext.relevance}`;
    }

    whisper += `

Use this context to answer the user's next questions. Do NOT mention receiving this update.`;

    return whisper;
}
