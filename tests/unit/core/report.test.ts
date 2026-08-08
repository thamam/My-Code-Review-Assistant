import { describe, it, expect } from 'vitest';
import { generateReport, renderReportMarkdown } from '../../../src/lib/report/index';
import type { PRData } from '../../../src/types/domain';

function makePR(): PRData {
  return {
    id: 'pr-42',
    title: 'Fix auth bug',
    author: 'alice',
    number: 42,
    owner: 'org',
    repo: 'repo',
    headSha: 'abc123',
    baseSha: 'def456',
    files: [
      { path: 'src/auth.ts', status: 'modified', additions: 10, deletions: 3 },
      { path: 'src/token.ts', status: 'added', additions: 50, deletions: 0 },
      { path: 'README.md', status: 'unchanged', additions: 0, deletions: 0 },
    ],
  } as unknown as PRData;
}

describe('F3 Report Generator', () => {

  it('computes verificationCoverage from fileVerificationStates', () => {
    const states = new Map([
      ['src/auth.ts', 'verified' as const],
    ]);
    const { verificationCoverage } = generateReport({
      prData: makePR(),
      fileVerificationStates: states,
      annotations: [],
    });
    // 1 reviewed out of 2 changed files (unchanged excluded)
    expect(verificationCoverage).toBeCloseTo(0.5);
  });

  it('counts flagged files as openFlags', () => {
    const states = new Map([
      ['src/auth.ts', 'flagged' as const],
      ['src/token.ts', 'verified' as const],
    ]);
    const report = generateReport({
      prData: makePR(),
      fileVerificationStates: states,
      annotations: [],
    });
    expect(report.openFlags).toBe(1);
  });

  it('counts label annotations as openQuestions', () => {
    const annotations = [
      { id: '1', file: 'src/auth.ts', line: 5, type: 'label' as const, timestamp: 0 },
      { id: '2', file: 'src/auth.ts', line: 10, type: 'marker' as const, timestamp: 0 },
    ];
    const report = generateReport({
      prData: makePR(),
      fileVerificationStates: new Map(),
      annotations,
    });
    expect(report.openQuestions).toBe(1);
  });

  it('returns 0 coverage when no files reviewed', () => {
    const report = generateReport({
      prData: makePR(),
      fileVerificationStates: new Map(),
      annotations: [],
    });
    expect(report.verificationCoverage).toBe(0);
    expect(report.trustScore).toBe(0);
  });

  it('renders markdown with file table', () => {
    const states = new Map([['src/auth.ts', 'verified' as const]]);
    const report = generateReport({ prData: makePR(), fileVerificationStates: states, annotations: [] });
    const input = { prData: makePR(), fileVerificationStates: states, annotations: [] };
    const md = renderReportMarkdown(report, input);
    expect(md).toContain('# Code Review Report');
    expect(md).toContain('src/auth.ts');
    expect(md).toContain('verified');
    expect(md).toContain('Fix auth bug');
  });
});
