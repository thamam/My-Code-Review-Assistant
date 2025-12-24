/**
 * AtomizerService.ts
 * 
 * The "Brain" of Phase 7: Spec-Driven Traceability
 * 
 * Uses Gemini 3 Pro (Preview) to break down raw requirement documents
 * into atomic, testable assertions (SpecAtom[]).
 * 
 * Design decisions:
 * - Model: gemini-3-pro-preview (mandated by architecture constraints)
 * - Output: Structured JSON for reliable parsing
 * - Fail gracefully: Returns empty atoms array on error, not crash
 */

import { GoogleGenAI } from "@google/genai";
import { SpecDocument, SpecAtom, AtomizerInput, AtomizerResult } from "../types/SpecTypes";

const ATOMIZER_SYSTEM_PROMPT = `You are an expert requirements analyst. Your job is to break down requirement documents into atomic, testable assertions.

RULES:
1. Each atom must be a SINGLE, TESTABLE assertion.
2. Ignore boilerplate, greetings, and meta-commentary.
3. Extract the INTENT, not the exact wording.
4. Categorize each atom: logic, ui, schema, security, performance, or other.
5. If a file or path is mentioned, include it in the context array.
6. Generate sequential IDs: REQ-1, REQ-2, etc.

OUTPUT FORMAT (JSON):
{
  "title": "Extracted or provided title",
  "atoms": [
    {
      "id": "REQ-1",
      "category": "logic",
      "description": "User must be redirected to /dashboard after successful login",
      "context": ["auth.ts", "login.tsx"]
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Atomizes raw requirement content into structured SpecAtoms using Gemini 3 Pro.
 */
export async function atomize(input: AtomizerInput): Promise<AtomizerResult> {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[Atomizer] No API key available');
            return { success: false, error: 'No API key configured' };
        }

        const ai = new GoogleGenAI({ apiKey });

        console.debug('[Atomizer] Processing:', input.sourceId);

        const userPrompt = input.title
            ? `Title: ${input.title}\n\nContent:\n${input.content}`
            : input.content;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            config: {
                systemInstruction: ATOMIZER_SYSTEM_PROMPT,
                responseMimeType: 'application/json',
            },
            contents: userPrompt,
        });

        const text = response.text;
        if (!text) {
            console.warn('[Atomizer] Empty response from model');
            return { success: false, error: 'Empty response from model' };
        }

        const parsed = JSON.parse(text) as { title?: string; atoms: Partial<SpecAtom>[] };

        // Validate and normalize atoms
        const atoms: SpecAtom[] = (parsed.atoms || []).map((atom, index) => ({
            id: atom.id || `REQ-${index + 1}`,
            category: atom.category || 'other',
            description: atom.description || '',
            context: atom.context || [],
            status: 'pending' as const,
        }));

        const spec: SpecDocument = {
            id: input.sourceId,
            source: input.sourceType,
            title: input.title || parsed.title || 'Untitled Spec',
            rawContent: input.content,
            atoms,
            atomizedAt: Date.now(),
        };

        console.debug('[Atomizer] Generated', atoms.length, 'atoms for:', spec.title);
        return { success: true, spec };

    } catch (error: any) {
        console.error('[Atomizer] Failed to atomize:', error);
        return { success: false, error: error.message || 'Atomization failed' };
    }
}

/**
 * Re-atomizes an existing SpecDocument (useful after content updates).
 */
export async function reatomize(existingSpec: SpecDocument): Promise<AtomizerResult> {
    return atomize({
        content: existingSpec.rawContent,
        sourceId: existingSpec.id,
        sourceType: existingSpec.source,
        title: existingSpec.title,
    });
}
