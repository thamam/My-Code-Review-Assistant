/**
 * I3: Risk Scoring
 *
 * Scores each file in a changeset by risk level, using signals from a
 * ParsedSession (I1 output). The score reflects how much confidence we
 * have that the AI-generated changes are correct.
 *
 * Signals (additive, clamped to 1.0):
 *   - not_read_back (+0.40): File was written but never read back by the AI
 *   - high_churn    (+0.30): File was written 3+ times (repeated edits suggest uncertainty)
 *   - error_nearby  (+0.20): An error occurred within 3 turns of a write to this file
 */

import type { ParsedSession, FileWrite } from '../session-parser/types';

// ─── Output Types ─────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

export interface FileRiskScore {
  filePath: string;

  /** 0–1 composite score */
  score: number;

  /** Bucketed level */
  level: RiskLevel;

  /** Which signals contributed */
  signals: {
    not_read_back: boolean;
    high_churn: boolean;
    error_nearby: boolean;
  };

  /** Number of times the file was written */
  writeCount: number;
}

export interface SessionRiskReport {
  /** Per-file risk scores, sorted high→low */
  files: FileRiskScore[];

  /** Overall session risk: fraction of files scored medium/high */
  overallRisk: number;

  /** Files with high risk score */
  highRiskFiles: string[];
}

// ─── Scoring Weights ──────────────────────────────────────────────────────────

const W_NOT_READ_BACK = 0.40;
const W_HIGH_CHURN    = 0.30;
const W_ERROR_NEARBY  = 0.20;

/** Turns within this window of a write are considered "nearby" for error detection */
const ERROR_WINDOW_TURNS = 3;

/** Min write count to trigger the high_churn signal */
const CHURN_THRESHOLD = 3;

// ─── Main Scoring Function ────────────────────────────────────────────────────

/**
 * Score each file in `filePaths` using signals from the parsed session.
 *
 * @param session - Output of the I1 session parser
 * @param filePaths - File paths from the PR diff to score (should match session's written files)
 */
export function scoreFiles(session: ParsedSession, filePaths: string[]): SessionRiskReport {
  const notReadBackSet = new Set(session.filesNotRead);

  // Group writes by file path
  const writesByFile = new Map<string, FileWrite[]>();
  for (const fw of session.filesWritten) {
    const existing = writesByFile.get(fw.filePath) ?? [];
    existing.push(fw);
    writesByFile.set(fw.filePath, existing);
  }

  // Build a sorted set of error turn indices for O(log n) proximity lookup
  const errorTurnIndices = session.errorSequences.map(e => e.turnIndex).sort((a, b) => a - b);

  const scoredFiles: FileRiskScore[] = filePaths.map(filePath => {
    const writes = writesByFile.get(filePath) ?? [];
    const writeCount = writes.length;

    // Signal: not_read_back
    const not_read_back = notReadBackSet.has(filePath);

    // Signal: high_churn — written 3+ times
    const high_churn = writeCount >= CHURN_THRESHOLD;

    // Signal: error_nearby — any error within ERROR_WINDOW_TURNS of any write
    const error_nearby = writes.some(fw =>
      errorTurnIndices.some(errIdx => Math.abs(errIdx - fw.turnIndex) <= ERROR_WINDOW_TURNS)
    );

    const score = Math.min(
      1.0,
      (not_read_back ? W_NOT_READ_BACK : 0) +
      (high_churn    ? W_HIGH_CHURN    : 0) +
      (error_nearby  ? W_ERROR_NEARBY  : 0)
    );

    const level: RiskLevel = score >= 0.6 ? 'high' : score >= 0.3 ? 'medium' : 'low';

    return { filePath, score, level, signals: { not_read_back, high_churn, error_nearby }, writeCount };
  });

  // Sort high → low
  scoredFiles.sort((a, b) => b.score - a.score);

  const nonLow = scoredFiles.filter(f => f.level !== 'low');
  const overallRisk = scoredFiles.length > 0 ? nonLow.length / scoredFiles.length : 0;
  const highRiskFiles = scoredFiles.filter(f => f.level === 'high').map(f => f.filePath);

  return { files: scoredFiles, overallRisk, highRiskFiles };
}
