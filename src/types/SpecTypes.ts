/**
 * SpecTypes.ts
 * 
 * Universal Spec Compliance Types
 * Phase 7: Spec-Driven Traceability Architecture
 * 
 * These types decouple "Requirements" from any specific source (Linear, Jira, Markdown).
 * Theia only cares about Atoms: granular, testable units of intent.
 */

/**
 * The Universal Spec - canonical representation of "What needs to be done"
 */
export interface SpecDocument {
    /** Unique identifier, e.g., "LIN-123" or "specs/auth.md" */
    id: string;

    /** Source of the spec */
    source: 'linear' | 'markdown_file' | 'manual';

    /** Human-readable title */
    title: string;

    /** The original raw text content */
    rawContent: string;

    /** Granular breakdown into atomic requirements */
    atoms: SpecAtom[];

    /** When the spec was last atomized */
    atomizedAt?: number;
}

/**
 * The Atomic Requirement - smallest unit of logic Theia can verify
 */
export interface SpecAtom {
    /** Unique identifier within the spec, e.g., "REQ-1" */
    id: string;

    /** Category of the requirement */
    category: 'logic' | 'ui' | 'schema' | 'security' | 'performance' | 'other';

    /** Human-readable description of the requirement */
    description: string;

    /** Files/paths this atom is linked to */
    context: string[];

    /** Verification status */
    status: 'pending' | 'verified' | 'violated' | 'not_applicable';

    /** Optional: Specific line ranges in linked files */
    lineRanges?: { file: string; start: number; end: number }[];

    /** Optional: Reason for status (especially if violated) */
    statusReason?: string;
}

/**
 * Input for the Atomizer service
 */
export interface AtomizerInput {
    /** Raw markdown/text content to atomize */
    content: string;

    /** Source identifier for the spec */
    sourceId: string;

    /** Source type */
    sourceType: SpecDocument['source'];

    /** Optional: Title (will be extracted if not provided) */
    title?: string;
}

/**
 * Result from the Atomizer service
 */
export interface AtomizerResult {
    /** Whether atomization succeeded */
    success: boolean;

    /** The generated SpecDocument (if successful) */
    spec?: SpecDocument;

    /** Error message (if failed) */
    error?: string;
}

/**
 * Adapter interface for fetching specs from various sources
 */
export interface SpecAdapter {
    /** Unique identifier for this adapter */
    readonly adapterType: SpecDocument['source'];

    /** Fetch raw content from the source */
    fetch(identifier: string): Promise<{ content: string; title: string } | null>;
}
