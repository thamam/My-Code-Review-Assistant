import { describe, it, expect } from 'vitest';
import { scoreFiles } from '../../../src/lib/risk-scoring/index.js';
import type { ParsedSession } from '../../../src/lib/session-parser/types.js';

// Minimal ParsedSession factory
function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    sessionId: 'test-session',
    turns: [],
    prompts: [],
    toolCalls: [],
    toolCallsByCategory: {
      file_read: [], file_write: [], shell: [], task: [], agent: [],
      skill: [], search: [], ui: [], mcp: [], other: [],
    },
    filesRead: [],
    filesWritten: [],
    filesNotRead: [],
    thinkingTraces: [],
    errorSequences: [],
    metadata: {
      totalTurns: 0,
      totalToolCalls: 0,
    },
    ...overrides,
  };
}

function makeWrite(filePath: string, turnIndex = 1) {
  return { filePath, tool: 'Edit', toolUseId: `tw-${filePath}-${turnIndex}`, turnIndex };
}

function makeRead(filePath: string, turnIndex = 0) {
  return { filePath, tool: 'Read', toolUseId: `tr-${filePath}-${turnIndex}`, turnIndex };
}

function makeError(turnIndex: number) {
  return { toolName: 'Bash', toolUseId: `err-${turnIndex}`, errorMessage: 'Command failed', turnIndex };
}

describe('I3 Risk Scoring — scoreFiles', () => {

  // ── No signals — all low risk ────────────────────────────────────────────

  it('returns low risk for a file that was written and read back', () => {
    const session = makeSession({
      filesWritten: [makeWrite('src/auth.ts', 1)],
      filesRead:    [makeRead('src/auth.ts', 2)],
    });
    const result = scoreFiles(session, ['src/auth.ts']);
    expect(result.files[0].level).toBe('low');
    expect(result.files[0].score).toBe(0);
    expect(result.files[0].signals.not_read_back).toBe(false);
  });

  it('returns 0 score for a file with no signals', () => {
    const session = makeSession({
      filesWritten: [makeWrite('a.ts')],
      filesRead:    [makeRead('a.ts')],
    });
    const { files } = scoreFiles(session, ['a.ts']);
    expect(files[0].score).toBe(0);
  });

  // ── not_read_back signal (+0.40) ─────────────────────────────────────────

  it('adds 0.40 for not_read_back signal', () => {
    const session = makeSession({
      filesWritten: [makeWrite('src/risky.ts')],
      filesNotRead: ['src/risky.ts'],
    });
    const { files } = scoreFiles(session, ['src/risky.ts']);
    expect(files[0].score).toBeCloseTo(0.40);
    expect(files[0].level).toBe('medium');
    expect(files[0].signals.not_read_back).toBe(true);
  });


  // ── high_churn signal (+0.30) ────────────────────────────────────────────

  it('adds 0.30 for high_churn (3+ writes)', () => {
    const session = makeSession({
      filesWritten: [makeWrite('src/app.ts', 1), makeWrite('src/app.ts', 3), makeWrite('src/app.ts', 5)],
      filesRead:    [makeRead('src/app.ts', 2)],
    });
    const { files } = scoreFiles(session, ['src/app.ts']);
    expect(files[0].signals.high_churn).toBe(true);
    expect(files[0].score).toBeCloseTo(0.30);
    expect(files[0].writeCount).toBe(3);
  });

  it('does NOT trigger high_churn for 2 writes', () => {
    const session = makeSession({
      filesWritten: [makeWrite('src/app.ts', 1), makeWrite('src/app.ts', 3)],
      filesRead:    [makeRead('src/app.ts', 2)],
    });
    const { files } = scoreFiles(session, ['src/app.ts']);
    expect(files[0].signals.high_churn).toBe(false);
  });

  // ── error_nearby signal (+0.20) ──────────────────────────────────────────

  it('adds 0.20 for error_nearby (error within 3 turns of write)', () => {
    const session = makeSession({
      filesWritten:   [makeWrite('src/db.ts', 5)],
      filesRead:      [makeRead('src/db.ts', 6)],
      errorSequences: [makeError(7)], // 2 turns after write — within window
    });
    const { files } = scoreFiles(session, ['src/db.ts']);
    expect(files[0].signals.error_nearby).toBe(true);
    expect(files[0].score).toBeCloseTo(0.20);
  });

  it('does NOT trigger error_nearby when error is 4+ turns away', () => {
    const session = makeSession({
      filesWritten:   [makeWrite('src/db.ts', 5)],
      filesRead:      [makeRead('src/db.ts', 6)],
      errorSequences: [makeError(9)], // 4 turns after write — outside window
    });
    const { files } = scoreFiles(session, ['src/db.ts']);
    expect(files[0].signals.error_nearby).toBe(false);
  });

  // ── Score combination and capping ────────────────────────────────────────

  it('caps composite score at 1.0', () => {
    const session = makeSession({
      filesWritten:   [makeWrite('f.ts', 1), makeWrite('f.ts', 3), makeWrite('f.ts', 5)], // high_churn
      filesNotRead:   ['f.ts'], // not_read_back
      errorSequences: [makeError(2)], // error_nearby (within 3 of turn 1)
      // never_read would also fire since filesRead is empty
    });
    const { files } = scoreFiles(session, ['f.ts']);
    expect(files[0].score).toBeLessThanOrEqual(1.0);
    expect(files[0].level).toBe('high');
  });

  it('returns high risk level for score >= 0.6', () => {
    const session = makeSession({
      filesWritten: [makeWrite('danger.ts', 1), makeWrite('danger.ts', 3), makeWrite('danger.ts', 5)],
      filesNotRead: ['danger.ts'], // not_read_back: +0.40, high_churn: +0.30 = 0.70
      filesRead:    [makeRead('danger.ts', 2)],
    });
    const { files } = scoreFiles(session, ['danger.ts']);
    expect(files[0].score).toBeCloseTo(0.70);
    expect(files[0].level).toBe('high');
  });

  it('returns medium risk level for score in [0.3, 0.6)', () => {
    const session = makeSession({
      filesWritten: [makeWrite('medium.ts', 1)],
      filesNotRead: ['medium.ts'], // not_read_back: +0.40
      filesRead:    [makeRead('medium.ts')],
    });
    const { files } = scoreFiles(session, ['medium.ts']);
    expect(files[0].level).toBe('medium');
  });

  // ── Multiple files, sorting ───────────────────────────────────────────────

  it('sorts output high to low', () => {
    const session = makeSession({
      filesWritten: [makeWrite('risky.ts', 1), makeWrite('safe.ts', 2)],
      filesNotRead: ['risky.ts'],
      filesRead:    [makeRead('risky.ts', 3), makeRead('safe.ts', 3)],
    });
    const { files } = scoreFiles(session, ['safe.ts', 'risky.ts']);
    expect(files[0].filePath).toBe('risky.ts');
    expect(files[1].filePath).toBe('safe.ts');
  });

  it('reports highRiskFiles correctly', () => {
    const session = makeSession({
      filesWritten: [makeWrite('a.ts', 1), makeWrite('a.ts', 3), makeWrite('a.ts', 5)],
      filesNotRead: ['a.ts'],
      filesRead:    [makeRead('b.ts', 1)],
    });
    const { highRiskFiles } = scoreFiles(session, ['a.ts', 'b.ts']);
    expect(highRiskFiles).toContain('a.ts');
    expect(highRiskFiles).not.toContain('b.ts');
  });

  it('computes overallRisk as fraction of medium+high files', () => {
    const session = makeSession({
      filesWritten: [makeWrite('a.ts', 1)],
      filesNotRead: ['a.ts'], // medium risk
      filesRead:    [makeRead('b.ts', 1)],
    });
    const { overallRisk } = scoreFiles(session, ['a.ts', 'b.ts']);
    // 1 medium file out of 2 = 0.5
    expect(overallRisk).toBeCloseTo(0.5);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns empty report for empty filePaths', () => {
    const session = makeSession();
    const result = scoreFiles(session, []);
    expect(result.files).toHaveLength(0);
    expect(result.overallRisk).toBe(0);
    expect(result.highRiskFiles).toHaveLength(0);
  });

  it('scores files not present in session writes as 0', () => {
    const session = makeSession(); // no writes
    const { files } = scoreFiles(session, ['not-in-session.ts']);
    expect(files[0].score).toBe(0);
    expect(files[0].level).toBe('low');
  });
});
