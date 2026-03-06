/**
 * I2: Prompt→Requirements extractor
 *
 * Scans user prompts from a parsed session and extracts implied requirements
 * as verifiable review items using rule-based pattern matching.
 *
 * No LLM call — rule-based for zero latency.
 */

import type { ParsedSession } from '../session-parser/types.js';
import type { Requirement } from '../../types/review.js';

// Sentence patterns that signal a requirement
const REQUIREMENT_PATTERNS: RegExp[] = [
  /\b(must|should|need[s]? to|has to|have to|ensure[s]?|make sure|be sure|guarantee[s]?|require[s]?)\b/i,
  /\b(don['']?t|do not|never|avoid|prevent[s]?)\b/i,
  /\b(always|every time|all [a-z]+ must)\b/i,
];

function isRequirementSentence(sentence: string): boolean {
  return REQUIREMENT_PATTERNS.some(p => p.test(sentence));
}

function splitIntoSentences(text: string): string[] {
  // Simple split on ., !, ? — preserve the delimiter by joining short fragments
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);  // drop very short fragments
}

export interface ExtractedRequirements {
  requirements: Omit<Requirement, 'codeSections' | 'verificationState' | 'notes'>[];
}

/**
 * Extracts implied requirements from all user prompts in a parsed session.
 * Returns deduplicated, indexed requirement candidates.
 */
export function extractRequirements(session: ParsedSession): ExtractedRequirements {
  const seen = new Set<string>();
  const requirements: ExtractedRequirements['requirements'] = [];

  for (const prompt of session.prompts) {
    const sentences = splitIntoSentences(prompt.text);
    for (const sentence of sentences) {
      if (!isRequirementSentence(sentence)) continue;
      // Normalise: lowercase, strip trailing punct for dedup
      const key = sentence.toLowerCase().replace(/[.!?]+$/, '').trim();
      if (seen.has(key)) continue;
      seen.add(key);

      requirements.push({
        id: `req-${requirements.length + 1}`,
        text: sentence.trim(),
        sourcePromptIndex: prompt.index,
      });
    }
  }

  return { requirements };
}
