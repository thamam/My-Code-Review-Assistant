/**
 * DiagramParser.ts
 * 
 * Parses Mermaid diagram source to extract code references.
 * Supports the §filepath:line annotation syntax for diagram-to-code navigation.
 * 
 * Example:
 *   "main()§utils/api.ts:20" → description: "main()", filepath: "utils/api.ts", line: 20
 */

import { CodeReference } from '../types/DiagramTypes';

/** 
 * Regex to match § annotations.
 * Format: description§filepath:line
 * Groups: [1] = description (before §), [2] = filepath, [3] = line number
 */
const REF_PATTERN = /([^§\[\]]+)§([^:\s\]]+):(\d+)/g;

/**
 * Generates a unique ID for a code reference.
 */
const generateRefId = (filepath: string, line: number, index: number): string => {
    const fileHash = filepath.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20);
    return `ref-${fileHash}-L${line}-${index}`;
};

/**
 * Parse a Mermaid diagram source to extract code references and clean the source.
 * 
 * @param source - The raw Mermaid source with § annotations
 * @returns Object with cleanedSource (ready for rendering) and references array
 * 
 * @example
 * const result = parseMermaid(`
 *   graph TD
 *     A[fetchData§services/api.ts:42] --> B[transform§utils/helpers.ts:15]
 * `);
 * // result.cleanedSource has "fetchData" and "transform" without the § parts
 * // result.references contains the CodeReference objects
 */
export function parseMermaid(source: string): {
    cleanedSource: string;
    references: CodeReference[];
} {
    const references: CodeReference[] = [];
    let refIndex = 0;

    // Replace each match with just the description, collecting references
    const cleanedSource = source.replace(REF_PATTERN, (match, description, filepath, lineStr) => {
        const line = parseInt(lineStr, 10);
        const trimmedDesc = description.trim();
        const trimmedPath = filepath.trim();

        references.push({
            id: generateRefId(trimmedPath, line, refIndex++),
            description: trimmedDesc,
            filepath: trimmedPath,
            line,
            status: 'pending'
        });

        // Return just the description for clean rendering
        return trimmedDesc;
    });

    return { cleanedSource, references };
}

/**
 * Find a reference by its ID.
 */
export function findReferenceById(
    references: CodeReference[],
    id: string
): CodeReference | undefined {
    return references.find(ref => ref.id === id);
}

/**
 * Find all references pointing to a specific file.
 */
export function findReferencesByFile(
    references: CodeReference[],
    filepath: string
): CodeReference[] {
    return references.filter(ref => ref.filepath === filepath);
}

/**
 * Mark a reference as visited.
 */
export function markReferenceVisited(
    references: CodeReference[],
    id: string
): CodeReference[] {
    return references.map(ref =>
        ref.id === id ? { ...ref, status: 'visited' as const } : ref
    );
}

/**
 * Check if a string contains any § annotations.
 */
export function hasCodeReferences(source: string): boolean {
    REF_PATTERN.lastIndex = 0; // Reset regex state
    return REF_PATTERN.test(source);
}
