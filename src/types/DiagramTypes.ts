/**
 * DiagramTypes.ts
 * 
 * Core types for Diagram-Driven Navigation (Phase 8)
 * Enables clickable "Diagram-to-Code" navigation using §filepath:line syntax.
 */

/**
 * A reference to a specific location in the codebase.
 * Extracted from the § syntax in Mermaid diagrams.
 */
export interface CodeReference {
    /** Unique identifier for this reference */
    id: string;

    /** Human-readable description (text before §) */
    description: string;

    /** Path to the file, relative to project root */
    filepath: string;

    /** Line number in the file */
    line: number;

    /** Navigation status */
    status: 'pending' | 'visited' | 'not_found';
}

/**
 * Metadata for a diagram with embedded code references.
 */
export interface DiagramMeta {
    /** Unique identifier for this diagram */
    id: string;

    /** Human-readable title */
    title: string;

    /** The original Mermaid source (with § annotations) */
    mermaidSource: string;

    /** The cleaned Mermaid source (§ annotations removed for rendering) */
    cleanedSource: string;

    /** Extracted code references */
    references: CodeReference[];
}

/**
 * A navigation target extracted from a diagram click.
 */
export interface NavigationTarget {
    /** Path to the file */
    filepath: string;

    /** Line number to navigate to */
    line: number;

    /** Source of the navigation (e.g., diagram ID or reference ID) */
    source: string;
}
