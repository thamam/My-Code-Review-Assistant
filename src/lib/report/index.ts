/**
 * F3: Review Report Generator
 *
 * Generates a ReviewReport from accumulated review state.
 * Pure function — no side effects.
 */

import type { PRData, Annotation } from '../../../types';
import type { VerificationState } from '../../types/review';
import type { ReviewReport } from '../../types/review';
import type { FileRiskScore } from '../risk-scoring/index';

export interface ReportInput {
  prData: PRData;
  fileVerificationStates: Map<string, VerificationState>;
  annotations: Annotation[];
  fileRiskScores?: Map<string, FileRiskScore>;
}

/** Builds a ReviewReport value from current review state. */
export function generateReport(input: ReportInput): ReviewReport {
  const { prData, fileVerificationStates, annotations } = input;

  // Single pass: count reviewed + flagged simultaneously
  let reviewedCount = 0;
  let flaggedCount = 0;
  const changedFiles = prData.files.filter(f => f.status !== 'unchanged');
  for (const f of changedFiles) {
    const state = fileVerificationStates.get(f.path) ?? 'unreviewed';
    if (state !== 'unreviewed') reviewedCount++;
    if (state === 'flagged') flaggedCount++;
  }

  const total = changedFiles.length;
  const verificationCoverage = total > 0 ? reviewedCount / total : 0;
  const openFlags = flaggedCount;
  const openQuestions = annotations.filter(a => a.type === 'label').length;

  // trustScore = coverage penalised by 50% of the flagged-files ratio
  // e.g. 100% reviewed, 10% flagged → 1.0 - 0.5*0.1 = 0.95
  const trustScore = Math.max(0, verificationCoverage - (total > 0 ? (flaggedCount / total) * 0.5 : 0));

  return {
    sessionId: prData.id,
    generatedAt: Date.now(),
    comments: [],       // ReviewComment — populated from annotations if extended later
    verificationCoverage,
    requirementsCoverage: 0,   // Populated by I2 when available
    trustScore,
    openFlags,
    openQuestions,
    format: 'markdown',
  };
}

/** Renders a ReviewReport as a markdown string suitable for download. */
export function renderReportMarkdown(report: ReviewReport, input: ReportInput): string {
  const { prData, fileVerificationStates, annotations } = input;
  const date = new Date(report.generatedAt).toISOString().slice(0, 10);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const statusEmoji: Record<VerificationState, string> = {
    unreviewed: '⬜',
    inspected: '🔵',
    verified: '✅',
    flagged: '🚩',
    'ai-verified': '🤖',
  };

  const changedFiles = prData.files.filter(f => f.status !== 'unchanged');

  const fileRows = changedFiles.map(f => {
    const state = fileVerificationStates.get(f.path) ?? 'unreviewed';
    const icon = statusEmoji[state];
    const adds = f.additions > 0 ? `+${f.additions}` : '';
    const dels = f.deletions > 0 ? `-${f.deletions}` : '';
    return `| ${icon} | \`${f.path}\` | ${state} | ${adds} ${dels} |`;
  });

  const annotationRows = annotations.map(a =>
    `| \`${a.file}\`:${a.line} | ${a.type} | ${a.title ?? ''} |`
  );

  const lines = [
    `# Code Review Report`,
    ``,
    `**PR:** ${prData.title}`,
    `**Author:** ${prData.author}`,
    `**Date:** ${date}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files reviewed | ${Math.round(report.verificationCoverage * changedFiles.length)} / ${changedFiles.length} (${pct(report.verificationCoverage)}) |`,
    `| Open flags | ${report.openFlags} |`,
    `| Annotations | ${report.openQuestions} |`,
    `| Trust score | ${pct(report.trustScore)} |`,
    ``,
    `## File Coverage`,
    ``,
    `| | File | Status | Changes |`,
    `|---|------|--------|---------|`,
    ...fileRows,
  ];

  if (annotationRows.length > 0) {
    lines.push(
      ``,
      `## Annotations`,
      ``,
      `| Location | Type | Note |`,
      `|----------|------|------|`,
      ...annotationRows
    );
  }

  return lines.join('\n');
}
