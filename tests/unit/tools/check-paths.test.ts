import { describe, it, expect } from 'vitest';
import { stripComments } from '../../../tools/check-paths.mjs';

/**
 * Regression coverage for tools/check-paths.mjs's comment/string/template/
 * regex scanner. Each case here reproduces a class of bug where the
 * scanner desyncs — opens a block-comment / template-literal / etc. it
 * never legitimately closes — and silently blanks every module specifier
 * after that point for the rest of the file, while the script still exits
 * 0. That failure mode is worse than the scanner not running at all,
 * because check-paths is trusted as a hard gate.
 *
 * All fixture source snippets below are written as single template
 * literals (backticks), not plain quoted strings. This is deliberate, not
 * cosmetic: check-paths.mjs runs over its OWN test suite too, and a plain
 * '...' or "..." fixture containing the literal text "from './...'" reads,
 * to check-paths' own from-clause pattern, exactly like a real import —
 * it would flag these fixtures as unresolved specifiers in check-paths'
 * own gate run. Template-literal contents are blanked wholesale by
 * stripComments (by design — see its doc comment), so wrapping fixtures in
 * backticks keeps them inert from check-paths' point of view while still
 * being ordinary strings from vitest's point of view.
 */
describe('check-paths stripComments — desync regressions', () => {
  it('does not blank a specifier following a glob-shaped string ("**\\/**")', () => {
    // A trailing '/**' inside a string reads, without string-literal
    // awareness, exactly like the start of a block comment.
    const src = `const g = '**/node_modules/**';
import { gone } from './also-missing-module';`;

    const { text, unterminated } = stripComments(src);

    expect(unterminated).toBeNull();
    expect(text).toContain(`from './also-missing-module'`);
  });

  it('does not blank a specifier following a backtick inside a regex literal', () => {
    // src/utils/VoiceUtils.ts:16 in this repo: /`[^`]+`/g — an odd number
    // of backticks inside a regex literal used to open template-literal
    // mode on the regex's first backtick and skip to the next raw
    // backtick anywhere in the file (or EOF), desyncing the scanner.
    const src = `const fence = /\`[^\`]+\`/g;
import { gone } from './also-missing-module';`;

    const { text, unterminated } = stripComments(src);

    expect(unterminated).toBeNull();
    expect(text).toContain(`from './also-missing-module'`);
  });

  it('does not blank a specifier following a markdown-fence regex with an even backtick count', () => {
    // Agent.ts:848-style: two ``` regex literals on the same line. Even
    // total backtick count previously happened to "resync" by luck; this
    // asserts it also works by design now, not by accident.
    const src = `const cleanText = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
import { gone } from './also-missing-module';`;

    const { text, unterminated } = stripComments(src);

    expect(unterminated).toBeNull();
    expect(text).toContain(`from './also-missing-module'`);
  });

  it('still finds an import through the multi-part markdown-fence-splitting regex (ChatMessage.tsx:60 shape)', () => {
    const src = `const parts = text.split(/\`\`\`(\\w+)?\\s*\\n?([\\s\\S]*?)\`\`\`/g);
import { gone } from './also-missing-module';`;

    const { text, unterminated } = stripComments(src);

    expect(unterminated).toBeNull();
    expect(text).toContain(`from './also-missing-module'`);
  });

  it('flags a genuinely unterminated template literal instead of silently reaching EOF', () => {
    const src = `import { gone } from './also-missing-module';
const x = \` never closed`;

    const { unterminated } = stripComments(src);

    expect(unterminated).toEqual({ kind: 'template literal', line: 2 });
  });

  it('flags a genuinely unterminated block comment instead of silently reaching EOF', () => {
    const src = `import { gone } from './also-missing-module';
/* never closes`;

    const { unterminated } = stripComments(src);

    expect(unterminated).toEqual({ kind: 'block comment', line: 2 });
  });

  it('treats a genuine division as division, not a regex literal, after a value', () => {
    // Regression guard on the heuristic itself: `a / b` after an
    // identifier (a value) must not be mistaken for a regex-literal open.
    const src = `const ratio = total / count;
import { gone } from './also-missing-module';`;

    const { text, unterminated } = stripComments(src);

    expect(unterminated).toBeNull();
    expect(text).toContain(`from './also-missing-module'`);
  });
});
