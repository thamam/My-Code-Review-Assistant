import { describe, it, expect } from 'vitest';
import { buildContextEnvelope } from '../../../src/prompts/contextEnvelope';

// Thin re-assertion importing the moved function directly. The full 18-case
// matrix lives in ContextInjection.test.ts, pointed at the Agent delegate —
// this file only proves the direct import works and produces the same shape.
describe('buildContextEnvelope (direct import)', () => {
  it('returns bare USER_QUERY when context is null', () => {
    expect(buildContextEnvelope('Hello', null)).toBe('USER_QUERY: Hello');
  });

  it('injects ACTIVE_FILE and USER_QUERY when context is present', () => {
    const envelope = buildContextEnvelope('Q', { activeFile: 'src/main.ts', activeTab: 'files' } as any);
    expect(envelope).toContain('ACTIVE_FILE: src/main.ts');
    expect(envelope).toContain('USER_QUERY: Q');
    expect(envelope).toContain('[SYSTEM_CONTEXT]');
  });

  it('injects WARNING when no active file', () => {
    const envelope = buildContextEnvelope('Q', { activeFile: null, activeTab: 'files' } as any);
    expect(envelope).toContain('WARNING: No active file detected');
  });
});
