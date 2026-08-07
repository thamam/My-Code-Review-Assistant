import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../../src/prompts/systemPrompt';
import { agent } from '../../../src/modules/core/Agent';

const agentAny = agent as any;

describe('buildSystemPrompt', () => {
  describe('engine: agent (regression lock)', () => {
    it('is byte-identical to Agent.buildSystemPrompt for the same inputs', () => {
      const context = { activeFile: 'src/main.ts', activeTab: 'files' as const, isDiffMode: true, appMode: 'pr' as const };
      const prData = { title: 'My PR', author: 'tomer' };

      const direct = buildSystemPrompt({ context: context as any, prData, engine: 'agent' });
      const viaDelegate = agentAny.buildSystemPrompt(context, prData);

      expect(direct).toBe(viaDelegate);
    });

    it('never contains the no-tools constraint or manifest', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me', files: [{ path: 'a.ts', status: 'modified' }] },
        engine: 'agent',
      });
      expect(prompt).not.toContain('CANNOT navigate');
      expect(prompt).not.toContain('## PR FILES');
    });

    it('ignores the language input entirely', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'agent',
        language: 'Hebrew',
      });
      expect(prompt).not.toContain('strictly in Hebrew');
      expect(prompt).not.toContain('same language the user uses');
    });
  });

  describe('engine: simple', () => {
    it('contains the no-tools constraint and no tool-instruction language', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'simple',
      });
      expect(prompt).toContain('CANNOT navigate');
      expect(prompt).not.toContain('navigate_to_code');
      expect(prompt).not.toContain('change_tab');
      expect(prompt).not.toContain('toggle_diff_mode');
    });

    it('includes the PR manifest header and entries', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: {
          title: 'PR',
          author: 'me',
          files: [{ path: 'src/a.ts', status: 'modified' }, { path: 'src/b.ts', status: 'added' }],
        },
        engine: 'simple',
      });
      expect(prompt).toContain('## PR FILES');
      expect(prompt).toContain('- src/a.ts (modified)');
      expect(prompt).toContain('- src/b.ts (added)');
    });

    it('caps the manifest at 300 entries with an "…and N more" tail', () => {
      const files = Array.from({ length: 400 }, (_, i) => ({ path: `file-${i}.ts`, status: 'modified' }));
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me', files },
        engine: 'simple',
      });
      expect(prompt).toContain('- file-0.ts (modified)');
      expect(prompt).toContain('- file-299.ts (modified)');
      expect(prompt).not.toContain('- file-300.ts (modified)');
      expect(prompt).toContain('…and 100 more');
    });

    it('omits the manifest section entirely when prData has no files', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'simple',
      });
      expect(prompt).not.toContain('## PR FILES');
    });
  });

  describe('buildModeSection passthrough (both engines)', () => {
    const modes = ['pr', 'learn', 'dive', 'custom'] as const;
    const expectedLabel: Record<string, string> = {
      pr: 'MODE: PR REVIEW',
      learn: 'MODE: LEARN THE CODE BASE',
      dive: 'MODE: CODE DIVE',
      custom: 'MODE: CUSTOM REVIEW',
    };

    for (const engine of ['agent', 'simple'] as const) {
      for (const mode of modes) {
        it(`includes ${expectedLabel[mode]} for engine=${engine}`, () => {
          const prompt = buildSystemPrompt({
            context: { activeFile: 'f.ts', appMode: mode } as any,
            prData: { title: 'PR', author: 'me' },
            engine,
          });
          expect(prompt).toContain(expectedLabel[mode]);
        });
      }
    }
  });

  describe('language instruction (simple only)', () => {
    it('Hebrew produces a strict-language instruction', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'simple',
        language: 'Hebrew',
      });
      expect(prompt).toContain('Respond strictly in Hebrew.');
    });

    it('Auto produces the auto-detect sentence', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'simple',
        language: 'Auto',
      });
      expect(prompt).toContain('Respond in the same language the user uses');
    });

    it('defaults to the auto-detect sentence when language is omitted', () => {
      const prompt = buildSystemPrompt({
        context: { activeFile: 'f.ts' } as any,
        prData: { title: 'PR', author: 'me' },
        engine: 'simple',
      });
      expect(prompt).toContain('Respond in the same language the user uses');
    });
  });
});
