/**
 * src/modules/core/agent/planJsonParser.ts
 *
 * Concern 2 (Stage F decomposition): the Planner's fallback plan recovery.
 *
 * Normally the Planner forces a `submit_plan` function call, and the plan
 * comes from `functionCall.args`. Sometimes the model ignores that and
 * replies with plain text instead — occasionally a clean JSON object,
 * occasionally JSON wrapped in a ```json fence, occasionally JSON buried in
 * explanatory prose, occasionally a truncated/malformed object. This module
 * is the greedy recovery attempted in that case, extracted so it can be unit
 * tested against those malformed shapes directly, without driving the whole
 * agent (there was previously no way to exercise this logic without a live
 * or mocked Gemini call returning exactly the right kind of bad output).
 *
 * Two strategies, tried in order:
 *   1. Strip ```json fences (if any) and parse the whole text.
 *   2. Greedy regex: grab the largest `{...}` span in the text and parse
 *      that (survives leading/trailing prose around the JSON).
 *
 * This module does not decide whether the result is a *usable* plan (i.e.
 * whether it has a valid `steps` array) — that's `hasStepsArray` below, kept
 * separate so callers can log/react to "found JSON but not a plan" and
 * "found no JSON at all" differently, exactly as the original inline code
 * did (see plannerNode's original before/after in the Stage F commit).
 */

export type PlanParseOutcome =
  | { status: 'parsed'; via: 'direct' | 'greedy'; data: any }
  | { status: 'no-json-found' }
  | { status: 'invalid-json' }; // a `{...}` span was found but didn't parse

/**
 * Recovers a JSON value from raw model text that didn't arrive as a
 * `submit_plan` function call.
 */
export function parsePlanFromText(text: string): PlanParseOutcome {
  // STRATEGY 1: Clean Markdown wrappers, then parse the whole text.
  try {
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanText);
    return { status: 'parsed', via: 'direct', data };
  } catch {
    // STRATEGY 2: "Greedy" Regex Search (find the largest {...} span).
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { status: 'no-json-found' };
    }
    try {
      const data = JSON.parse(jsonMatch[0]);
      return { status: 'parsed', via: 'greedy', data };
    } catch {
      return { status: 'invalid-json' };
    }
  }
}

/** True when a parsed value has the `steps: [...]` shape a plan needs. */
export function hasStepsArray(data: unknown): data is { steps: any[]; goal?: string } {
  const d = data as { steps?: unknown } | null | undefined;
  return !!(d && Array.isArray(d.steps));
}
