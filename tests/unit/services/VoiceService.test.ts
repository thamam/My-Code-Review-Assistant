import { describe, it, expect } from 'vitest';
import { extractVoiceTrack } from '../../../src/services/VoiceService';

describe('extractVoiceTrack — plain-text fallback branch (FIX 1)', () => {
  it('sanitizes a fenced code block (with language tag) out of a plain markdown answer', () => {
    const payload =
      'Here is the fix:\n\n```typescript\nconst x = 1;\n```\n\nThat should do it.';

    const result = extractVoiceTrack(payload);

    // The fence markers, the language tag, and the code body must all be gone.
    expect(result).not.toContain('```');
    expect(result).not.toContain('typescript');
    expect(result).not.toContain('const x = 1');
    // The surrounding prose survives.
    expect(result).toContain('Here is the fix');
    expect(result).toContain('That should do it');
    expect(result.length).toBeLessThanOrEqual(400);
  });

  it('caps the sanitized fallback text at 400 characters', () => {
    const payload = 'a'.repeat(1000);

    const result = extractVoiceTrack(payload);

    expect(result.length).toBe(400);
    expect(result).toBe('a'.repeat(400));
  });

  it('REGRESSION GUARD: a genuine Dual-Track JSON payload short-circuits and returns its voice field unchanged', () => {
    // Same shape as formatDualTrack() in src/modules/core/Agent.ts: { voice, screen }.
    // The voice field is deliberately > 400 chars and contains backticks so that,
    // if this ever mistakenly fell through to the sanitize+cap fallback branch,
    // the assertions below would fail.
    const longVoice = 'A'.repeat(450) + ' end with `code`.';
    const payload = JSON.stringify({
      voice: longVoice,
      screen: '**Screen** markdown with `code` and a\n```ts\nfence\n```',
    });

    const result = extractVoiceTrack(payload);

    expect(result).toBe(longVoice);
    expect(result.length).toBeGreaterThan(400);
    expect(result).toContain('`code`');
  });
});
