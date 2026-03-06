/**
 * review.ts
 *
 * Core shared data model for the Theia Review system.
 * Phase 0: Foundation types — used by I1 (Session Parser), F1 (Review Map),
 * F3 (Checkpoints), and F4 (Chat).
 */

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * 5-state verification model per section / review unit.
 * Progression: unreviewed → inspected → verified (or flagged).
 * ai-verified is a separate trust level — AI reviewed but human hasn't.
 */
export type VerificationState =
  | 'unreviewed'
  | 'inspected'
  | 'verified'
  | 'flagged'
  | 'ai-verified';

// ─── Code Location ────────────────────────────────────────────────────────────

/** A precise reference to a range of lines in a file. */
export interface LineRange {
  file: string;
  startLine: number;
  endLine: number;
}

/** A reference to a named code section (function, class, block). */
export interface CodeSectionRef {
  file: string;
  sectionName?: string;   // e.g. "handleAuth", "UserModel"
  lineRange?: LineRange;
}

// ─── Review Unit ─────────────────────────────────────────────────────────────

/**
 * A logical chunk of the changeset that the reviewer traverses as a unit.
 * Sized to ≤400 LOC to respect cognitive limits (P3).
 * Groups related files/sections that belong to the same logical change.
 */
export interface ReviewUnit {
  id: string;

  /** Human-readable label: "Auth middleware", "User model refactor" */
  label: string;

  /** Files included in this unit */
  files: string[];

  /** Approximate LOC across all files in this unit */
  estimatedLoc: number;

  /** Which prompts (by index) led to changes in this unit */
  sourcePromptIndices: number[];

  /** Current verification state */
  verificationState: VerificationState;

  /** Child units (for stacked/dependency-ordered units) */
  dependsOn: string[];   // ReviewUnit ids this unit depends on
}

// ─── Requirement ─────────────────────────────────────────────────────────────

/**
 * A verifiable requirement extracted from user prompts.
 * Produced by I2 (Prompt→Requirements) — not populated in Phase 0.
 */
export interface Requirement {
  id: string;

  /** The requirement text as extracted from the prompt */
  text: string;

  /** Index into ReviewSession.parsedSession.prompts */
  sourcePromptIndex: number;

  /** Code sections this requirement maps to */
  codeSections: CodeSectionRef[];

  /** Whether the reviewer has verified this requirement is met */
  verificationState: VerificationState;

  /** Optional: reviewer notes */
  notes?: string;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/** How an inline comment is attached to a code location. */
export type CommentAttachment =
  | { kind: 'line'; file: string; line: number }
  | { kind: 'range'; file: string; startLine: number; endLine: number }
  | { kind: 'section'; reviewUnitId: string }
  | { kind: 'session'; note: 'general' };

/**
 * An inline reviewer comment.
 * Tagged by intent: question / concern / suggestion / note.
 */
export interface ReviewComment {
  id: string;
  tag: 'question' | 'concern' | 'suggestion' | 'note';
  text: string;
  attachment: CommentAttachment;
  createdAt: number;   // Unix ms
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Aggregated output of a completed review session.
 * Compiled from all comments + verification state + requirements coverage.
 */
export interface ReviewReport {
  sessionId: string;
  generatedAt: number;

  comments: ReviewComment[];

  /** 0–1: fraction of review units with state ≠ unreviewed */
  verificationCoverage: number;

  /** 0–1: fraction of requirements with state = verified */
  requirementsCoverage: number;

  /**
   * Trust score: composite of coverage, flagged sections, AI-verified ratio.
   * 0 = no trust, 1 = fully verified by human.
   */
  trustScore: number;

  openFlags: number;
  openQuestions: number;

  /** Exportable as markdown or JSON */
  format: 'markdown' | 'json';
}

// ─── Session ──────────────────────────────────────────────────────────────────

/** Metadata about the review session itself. */
export interface ReviewSessionMetadata {
  /** Path to the source JSONL file */
  jsonlPath: string;

  /** When the Claude Code session was started */
  sessionStartedAt?: number;

  /** The working directory the Claude Code session ran in */
  workingDirectory?: string;

  /** Claude Code version that produced the session */
  claudeCodeVersion?: string;

  /** Git branch at session start */
  gitBranch?: string;
}

/**
 * Top-level container for a Theia review session.
 * Combines parsed Claude Code session + git diff + review state.
 */
export interface ReviewSession {
  id: string;

  /** Parsed Claude Code generation session */
  parsedSession: import('./session-parser').ParsedSession;

  /** Raw git diff for the changeset being reviewed */
  gitDiff?: string;

  /** Review units derived from the diff + dependency analysis */
  reviewUnits: ReviewUnit[];

  /** Requirements extracted from prompts (empty until I2 runs) */
  requirements: Requirement[];

  /** All inline comments */
  comments: ReviewComment[];

  metadata: ReviewSessionMetadata;
}
