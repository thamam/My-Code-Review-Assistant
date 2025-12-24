/**
 * ContextBrief - The output of the Director (1.5 Pro) that is injected into the Actor (2.0 Flash Live).
 * Must stay under 1000 tokens when serialized.
 */
export interface ContextBrief {
    /** ISO timestamp when brief was generated */
    generatedAt: string;

    /** Current file the user is viewing */
    activeFile: {
        path: string;
        /** 3-5 sentence summary of file purpose and key changes */
        summary: string;
        /** Notable line ranges, max 3 */
        highlights: Array<{
            lines: string;         // e.g., "42-58"
            reason: string;        // e.g., "Core validation logic"
        }>;
    } | null;

    /** Quick-lookup bullet points, max 5 */
    keyFacts: string[];

    /** If Linear issue is linked */
    linearContext?: {
        issueId: string;
        /** 1-2 sentence relevance to current file */
        relevance: string;
    };

    /** Relevant requirement IDs from SpecAtoms (e.g., ["REQ-1", "REQ-3"]) */
    relevantAtomIds?: string[];

    /** Suggested talking points for the Actor, max 3 */
    suggestedTopics: string[];
}
