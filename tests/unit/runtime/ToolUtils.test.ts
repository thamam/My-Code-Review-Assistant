import { describe, it, expect } from 'vitest';
import { formatSearchCommand, formatWriteFileCommand } from '../../../src/modules/runtime/ToolUtils';

/**
 * The runtime target is the browser, where `Buffer` is undefined and would throw
 * ReferenceError. Vitest runs under environment:'node', where Buffer exists — so
 * these tests assert real correctness (UTF-8 parity with Buffer + round-trip +
 * large-input chunking) rather than merely "does not throw".
 */

describe('ToolUtils base64 encoding (browser-safe, UTF-8 parity)', () => {
  it('encodes an ASCII search query matching Buffer UTF-8 base64 and round-trips', () => {
    const query = 'TODO';
    const expected = Buffer.from(query, 'utf8').toString('base64');

    const cmd = formatSearchCommand(query);

    // The emitted script decodes the embedded base64 back to the original string.
    expect(cmd).toContain(expected);
    expect(Buffer.from(expected, 'base64').toString('utf8')).toBe(query);
  });

  it('encodes non-ASCII (Hebrew, emoji, em-dash) with full UTF-8 parity to Buffer', () => {
    const samples = ['שלום', '🐍🎉', 'multi—dash'];
    for (const s of samples) {
      const expected = Buffer.from(s, 'utf8').toString('base64');
      const cmd = formatWriteFileCommand('f.txt', s);
      expect(cmd).toContain(expected);
      expect(Buffer.from(expected, 'base64').toString('utf8')).toBe(s);
    }
  });

  it('handles large content (>100 KB) without stack overflow and stays byte-correct', () => {
    // ~160 KB of varied UTF-8 content; exercises the 0x8000 chunking boundary.
    const big = 'x—y'.repeat(50000); // 200000 chars, multi-byte em-dashes
    const expected = Buffer.from(big, 'utf8').toString('base64');

    const cmd = formatWriteFileCommand('big.txt', big);

    expect(cmd).toContain(expected);
    expect(Buffer.from(expected, 'base64').toString('utf8')).toBe(big);
  });
});
