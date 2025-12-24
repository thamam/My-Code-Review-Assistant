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
import { ChatMessage } from "../../types";
import { SpecAtom } from "../types/SpecTypes";
import { DIRECTOR_SYSTEM_PROMPT, buildDirectorPrompt } from "../prompts/directorPrompt";

export interface DirectorInput {
    fileContent: string;
    filePath: string;
    prTitle: string;
    prDescription: string;
    /** Granular Spec Atoms (replaces legacy linearIssue) */
    specAtoms: SpecAtom[];
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
            input.specAtoms
        );

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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

    // Include Relevant Requirements from atoms (if any were in the brief context)
    if (brief.relevantAtomIds && brief.relevantAtomIds.length > 0) {
        whisper += `

Relevant Requirements: ${brief.relevantAtomIds.join(', ')}`;
    } else if (brief.linearContext) {
        // Backward compatibility for legacy linearContext
        whisper += `

Linear Issue ${brief.linearContext.issueId}: ${brief.linearContext.relevance}`;
    }

    whisper += `

Use this context to answer the user's next questions. Do NOT mention receiving this update.`;

    return whisper;
}

/** Response type for Precision Mode - decouples spoken from visual output */
export interface PrecisionResponse {
    voice: string;  // Natural, conversational - NO markdown, NO code blocks
    screen: string; // Full technical response with Markdown and code
}

/**
 * Generates a response using Gemini 3 Pro for "Precision Mode".
 * Returns structured JSON with separate voice and screen outputs.
 */
export async function generatePrecisionResponse(
    userText: string,
    history: ChatMessage[],
    input: DirectorInput
): Promise<PrecisionResponse | null> {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return null;

        const ai = new GoogleGenAI({ apiKey });

        // Build the requirements checklist from specAtoms
        const atomsChecklist = input.specAtoms.length > 0
            ? input.specAtoms.map(atom => `${atom.id} [${atom.category}]: ${atom.description}`).join('\n')
            : '(No requirements loaded)';

        // Voice-First Assistant system prompt
        const systemPrompt = `You are a Voice-First Coding Assistant.

You MUST generate TWO distinct outputs in valid JSON format:
1. "voice": A natural, conversational summary. NO markdown. NO code blocks. NO asterisks. 
   Speak like a senior engineer explaining a concept to a colleague. Keep it concise.
2. "screen": The full technical response with Markdown, code blocks, and details.

CONTEXT:
File: ${input.filePath}
PR: ${input.prTitle}

--- REQUIREMENTS TO CHECK ---
${atomsChecklist}
---

FILE CONTENT (Verified):
\`\`\`
${input.fileContent}
\`\`\`

INSTRUCTIONS:
1. Answer the user's question based on the code above.
2. For "voice": Be conversational and natural. Do NOT include symbols, markdown, or code.
3. For "screen": Provide full technical details with proper Markdown formatting.
4. Do NOT make things up. If information is not in the code, say so.

RESPONSE FORMAT (strict JSON):
{
  "voice": "Here's what I found...",
  "screen": "## Analysis\\n\\n\`\`\`typescript\\n...\`\`\`"
}
`;

        // Convert history to Gemini format (Content[])
        const chatHistory = history
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

        // Add the current user message
        const contents = [
            ...chatHistory,
            { role: 'user', parts: [{ text: userText }] }
        ];

        console.log('[DirectorService] Starting Precision Mode chat with history length:', chatHistory.length);
        console.log('[DirectorService] Sending user message:', userText);

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
            },
            contents: contents,
        });

        const responseText = response.text || '';

        console.log('[DirectorService] Received response:', {
            text: responseText.substring(0, 100) + '...',
            fullLength: responseText.length
        });

        // Parse JSON response
        const parsed = JSON.parse(responseText) as PrecisionResponse;

        // Validate required fields
        if (!parsed.voice || !parsed.screen) {
            console.warn('[DirectorService] Invalid response structure, missing voice/screen');
            return { voice: responseText, screen: responseText }; // Fallback
        }

        return parsed;

    } catch (e: any) {
        console.error("[DirectorService] Precision Mode Error:", e);
        return null;
    }
}

/**
 * Brain Mode: Chat with Gemini 3 Pro using full context.
 * This effectively acts as a grounded fallback for the Live API.
 */
export async function getBrainResponse(
    userText: string,
    history: { role: string; content: string }[],
    context: ContextBrief,
    apiKey: string
): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey });

        // Build system prompt with context
        const systemPrompt = `You are Theia (Voice Mode - Precision). 
You are a Staff Software Engineer reviewing code.
Speak naturally but concisely. Do not read code blocks aloud unless asked.
Use the provided context to answer grounded questions.
Be direct.

CONTEXT:
File: ${context.activeFile?.path || 'None'}
Summary: ${context.activeFile?.summary || 'N/A'}
Highlights: ${JSON.stringify(context.activeFile?.highlights || [])}
Facts: ${JSON.stringify(context.keyFacts || [])}
${context.relevantAtomIds?.length ? `\nRelevant Requirements: ${context.relevantAtomIds.join(', ')}` : ''}
`;

        // Convert history to Gemini Content format
        const chatHistory = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Add the current user message
        const contents = [
            ...chatHistory,
            { role: 'user', parts: [{ text: userText }] }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            config: {
                systemInstruction: systemPrompt,
            },
            contents: contents,
        });

        return response.text || "I'm having trouble forming a response.";
    } catch (error) {
        console.error("Brain Mode Error:", error);
        return "I'm having trouble thinking right now. Please try again.";
    }
}
