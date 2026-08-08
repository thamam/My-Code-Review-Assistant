#!/usr/bin/env node
/**
 * tools/check-paths.mjs
 *
 * Walks every relative module specifier ('./...' or '../...') appearing in
 * a module position across the repo's .ts/.tsx/.js/.mjs sources, and
 * asserts each one resolves to a real file on disk.
 *
 * BASELINE (for the next stage's gate to diff against): 319 specifiers
 * across 156 files, as of the commit that added this note. The pre-move
 * plan cited 317/155 — independently re-verified (by running both the old
 * and hardened script against the pre-move tree) to be stale; the true
 * pre-move / post-move count under either script version is 318/155. The
 * +1/+1 on top of that is tests/unit/tools/check-paths.test.ts (this
 * file's own regression test), added deliberately in the same change that
 * recorded this baseline. Any future drop below 319, or a rise not traced
 * to an explained, intentional file/specifier addition, is a walker
 * regression — treat it as a failure, not noise.
 *
 * Why this exists (and what nothing else in the gate catches): tsc, Vite,
 * and vitest each resolve module specifiers slightly differently, and none
 * of them catch a stale path inside `vi.mock()` / `vi.doMock()`. A stale
 * mock path does NOT throw a resolution error at test time — vi.mock just
 * silently stops intercepting that module, and the test quietly starts
 * hitting the real implementation while staying green. That failure mode
 * is invisible to tsc/vite/vitest and is exactly the risk profile of an
 * upcoming file move. This script is the deterministic check for it.
 *
 * Covers, in module position:
 *   - static imports:            import x from '...'; import '...';
 *   - re-exports:                export { x } from '...'; export * from '...';
 *   - dynamic import:            import('...')
 *   - require:                   require('...')
 *   - vitest module mocks:       vi.mock('...', ...); vi.doMock('...', ...)
 *
 * Deliberately NOT covered (cut from the plan as ceremony): import-boundary
 * / layering lint rules. This script only asserts specifiers resolve on
 * disk — it has no opinion on which module may import which.
 *
 * KNOWN LIMITATION (read before trusting a green run): this script proves
 * that a relative specifier resolves to a file ON DISK. It does NOT prove
 * that a `vi.mock('./foo', ...)` call names the same module the code under
 * test actually imports — e.g. after a file move, a mock path can still
 * resolve to *a* file while no longer being the file the moved production
 * code imports, or two now-differently-relative paths can both resolve
 * while pointing at different modules than before. vitest does not error
 * on a "successful but wrong" mock — the test quietly starts exercising
 * the real implementation instead of the mock, and can still pass. That
 * failure class is, empirically, the dominant post-move mock failure, and
 * this tool does not catch it. Passing check-paths is necessary, not
 * sufficient; still read vitest's own output for behavioral surprises.
 *
 * REGEX LITERALS (fixed after being caught live in this repo): a backtick
 * inside a regex literal — e.g. `/`[^`]+`/g` in VoiceUtils.ts, used to strip
 * inline code fences — used to be indistinguishable from the start of a
 * template literal. stripComments would open template-literal mode on the
 * regex's first backtick and skip to the next backtick anywhere in the
 * file (or to EOF, blanking every specifier after it, with no error). Fixed
 * with a heuristic regex-literal recognizer: a '/' is treated as opening a
 * regex literal when the last significant token emitted puts us in
 * "expression position" (start of file; after an operator/punctuation
 * character; after a regex-permitting keyword such as `return`, `typeof`,
 * `case`; after `{`; etc.), and NOT after something that reads as a value
 * (an identifier, a number, `)`, `]`, a closed string/template/regex, or —
 * biased conservatively for this repo's heavy .tsx/JSX use — `<` or `>`).
 * This is a heuristic, not a parser: division-vs-regex is occasionally
 * genuinely ambiguous in JS without full parsing. A wrong guess is bounded
 * to a single line (a regex literal can't span a newline, so a bogus
 * regex-mode attempt bails at the next '\n' and falls back to treating '/'
 * as an ordinary character) — it can never desync the scanner to EOF the
 * way the backtick bug did. See tests/unit/tools/check-paths.test.ts for
 * the regression fixture proving the backtick-in-regex case no longer
 * blanks a following import.
 *
 * DESYNC BACKSTOP: even with the above, some construct could in principle
 * still run unterminated to EOF (e.g. a genuinely unterminated template
 * literal in a syntactically-broken file). stripComments now reports
 * whether it ended the file still inside a block comment or template
 * literal; main() treats any such report as a hard failure naming the file
 * and the line the construct opened on, rather than letting the run stay
 * green while unable to see the rest of that file.
 *
 * Exit 0 = every relative specifier resolved AND every file's scan ended
 * cleanly (no unterminated block comment / template literal at EOF). Exit 1
 * otherwise (details printed to stderr).
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const INDEX_BASENAMES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

// Directories to skip entirely while walking the tree.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '_bmad',
  '_bmad-output',
  '.agent',
  '.gemini',
  '.claude',
  // Git worktrees for sibling branches live at <repo-root>/.worktrees/. Run
  // from the primary clone, the walker would otherwise descend into every
  // sibling branch's working tree too, double- (or N-) counting every file.
  '.worktrees',
]);

/** Recursively collect source files under `dir`. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

// Keywords after which a following '/' is in "expression position" (i.e.
// opens a regex literal, not a division). Not exhaustive — this is a
// heuristic scanner, not a parser — but covers the constructs that show up
// in real code (`return /foo/`, `typeof x === /foo/`, `case /foo/:`, ...).
const REGEX_CONTEXT_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'yield', 'throw', 'case', 'else', 'do', 'extends', 'default', 'await',
]);

function isIdentStart(ch) { return /[A-Za-z_$]/.test(ch); }
function isIdentPart(ch) { return /[A-Za-z0-9_$]/.test(ch); }

/**
 * String-literal- and regex-literal-aware comment stripper: blanks out
 * block comments and line comments so they can't produce spurious
 * specifier matches, while preserving line numbers (replaces comment
 * bodies with spaces, keeps newlines intact).
 *
 * Being string-literal aware matters because a comment-start sequence
 * occurring INSIDE a string or template literal is not a real comment
 * delimiter, and treating it as one is not a harmless false positive — it
 * is silent data loss. Concretely: a glob string such as
 * '**\/node_modules/**' ends in the two characters '/' then '*' (from its
 * trailing '/**'), which without string awareness looks exactly like the
 * start of a block comment. The scanner then swallows everything from
 * there until the next literal '*' + '/' sequence anywhere in the file —
 * which may not exist — blanking every specifier from that point to EOF
 * with no error printed. A resolver that silently skips is worse than a
 * resolver that never ran, because this stage trusts a green run. Hence:
 * track single-quote, double-quote, and backtick string state (with
 * backslash-escape handling) and suspend comment detection while inside
 * one.
 *
 * Being regex-literal aware matters for the same reason: a backtick inside
 * a regex literal (e.g. `/`[^`]+`/g`) is not a template-literal delimiter,
 * and mistaking it for one opens template-literal mode for real — skipping
 * to the next backtick anywhere in the file, or to EOF. See the file-level
 * doc comment for the heuristic used to tell "/" apart from a division
 * operator.
 *
 * Returns `{ text, unterminated }`: `text` is the stripped source; if the
 * scan ends the file still inside a block comment or template literal (a
 * construct that opened but never found its closing delimiter),
 * `unterminated` is `{ kind, line }` naming which construct and where it
 * opened — a signal that everything after that point in the file was never
 * actually scanned. `unterminated` is `null` when the scan completed
 * cleanly.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // Whether a '/' encountered right now opens a regex literal (true) or is
  // a division/operator (false), inferred from the last significant token
  // emitted. See file-level doc comment.
  let regexAllowed = true;
  /** @type {{kind: string, line: number} | null} */
  let unterminated = null;

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // Identifiers / keywords: consume the whole word at once so regex
    // context can special-case keywords like `return` / `typeof` that
    // permit a following regex literal, and so a bare identifier (a value)
    // correctly forbids one.
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      out += word;
      regexAllowed = REGEX_CONTEXT_KEYWORDS.has(word);
      i = j;
      continue;
    }
    // Numbers: also a value — forbids a following regex literal. Consumed
    // loosely (digits/letters/dots/underscores) to cover hex/exponent/
    // bigint/separator forms without needing full numeric-literal grammar.
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
      out += src.slice(i, j);
      regexAllowed = false;
      i = j;
      continue;
    }

    // Single- and double-quoted strings: copy through verbatim (the
    // PATTERNS regexes need to see the quotes and specifier text inside),
    // but track escapes so an escaped quote doesn't end the string early,
    // and so a '/*' or '//' inside the string can't be mistaken for a
    // comment start while we're inside it.
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === '\n') {
          // Unterminated string literal (invalid JS) — bail out of string
          // mode at the newline rather than swallowing the rest of the file.
          break;
        }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      regexAllowed = false;
      continue;
    }

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      const startLine = lineNumberAt(src, i);
      out += '  ';
      i += 2;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { closed = true; break; }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (closed) {
        out += '  ';
        i += 2;
      } else if (!unterminated) {
        unterminated = { kind: 'block comment', line: startLine };
      }
      continue;
    }

    // Regex literal: attempt one only where the last significant token
    // leaves us in expression position (see file-level doc comment). A
    // regex literal cannot span a newline, so a failed attempt (no closing
    // unescaped '/' before the next '\n') bails and falls through to
    // ordinary-character handling below — the '/' is then treated as
    // division, which is the safe default either way.
    if (c === '/' && regexAllowed) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const cj = src[j];
        if (cj === '\n') break;
        if (cj === '\\' && j + 1 < n) { j += 2; continue; }
        if (cj === '[') { inClass = true; j++; continue; }
        if (cj === ']') { inClass = false; j++; continue; }
        if (cj === '/' && !inClass) { closed = true; j++; break; }
        j++;
      }
      if (closed) {
        let k = j;
        while (k < n && /[a-zA-Z]/.test(src[k])) k++; // trailing flags
        for (let p = i; p < k; p++) out += (src[p] === '\n' ? '\n' : ' ');
        i = k;
        regexAllowed = false;
        continue;
      }
      // Not a valid single-line regex literal — fall through and treat
      // '/' as an ordinary character below.
    }

    if (c === '`') {
      // Skip template literals wholesale (they commonly embed code-as-text,
      // e.g. shell scripts, which is not a real module specifier), but stay
      // escape-aware so an escaped backtick (\`) doesn't end the literal
      // early and desynchronize every comment/string decision after it.
      const startLine = lineNumberAt(src, i);
      out += ' ';
      i++;
      let closed = false;
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          out += src[i] === '\n' ? '\n' : ' ';
          out += src[i + 1] === '\n' ? '\n' : ' ';
          i += 2;
          continue;
        }
        if (src[i] === '`') { closed = true; break; }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (closed) {
        out += ' ';
        i++;
      } else if (!unterminated) {
        unterminated = { kind: 'template literal', line: startLine };
      }
      regexAllowed = false;
      continue;
    }

    // Ordinary character: track regex context for what follows. `)` `]`
    // close off a value (call result / element access) so a following '/'
    // is division. `<` / `>` are biased the same way — deliberately
    // conservative because this repo is heavily .tsx/JSX, where a stray
    // '/' after a closing '>' (e.g. a self-closing tag on the same line as
    // another) is far more likely than a real comparison-then-regex. Every
    // other non-whitespace character (operators, punctuation, `{`, `}`,
    // start of file) is treated as expression position; a wrong guess here
    // is bounded to one line (see above), never silent-to-EOF.
    out += c;
    if (c === ')' || c === ']' || c === '<' || c === '>') {
      regexAllowed = false;
    } else if (c !== ' ' && c !== '\t' && c !== '\r' && c !== '\n') {
      regexAllowed = true;
    }
    i++;
  }
  return { text: out, unterminated };
}

// One capture group each: the quoted specifier. Applied to comment-stripped
// source. Only specifiers starting with '.' (relative) are kept downstream.
const PATTERNS = [
  { name: 'import/export ... from', re: /\bfrom\s*['"]([^'"]+)['"]/g },
  { name: 'side-effect import', re: /\bimport\s*['"]([^'"]+)['"]/g },
  { name: 'dynamic import()', re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g },
  { name: 'require()', re: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g },
  { name: 'vi.mock/vi.doMock', re: /\bvi\.(?:do)?[Mm]ock\s*\(\s*['"]([^'"]+)['"]/g },
];

function lineNumberAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === '\n') line++;
  return line;
}

/** Does `specifier` resolve to a real file, relative to the directory of `fromFile`? */
function resolves(specifier, fromFile) {
  const base = resolve(dirname(fromFile), specifier);

  // Exact path (specifier already carries an extension, e.g. './types.json').
  if (existsSync(base) && statSync(base).isFile()) return true;

  // Try appending each resolvable extension.
  for (const ext of RESOLVE_EXTENSIONS) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return true;
  }

  // Directory import: try index.* inside it.
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const idx of INDEX_BASENAMES) {
      const candidate = join(base, idx);
      if (existsSync(candidate) && statSync(candidate).isFile()) return true;
    }
  }

  return false;
}

function main() {
  const files = walk(ROOT);
  /** @type {{file: string, line: number, kind: string, specifier: string}[]} */
  const failures = [];
  /** @type {{file: string, line: number, kind: string}[]} */
  const scanIssues = [];
  let checked = 0;

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const { text: scanned, unterminated } = stripComments(raw);

    if (unterminated) {
      scanIssues.push({
        file: relative(ROOT, file),
        line: unterminated.line,
        kind: unterminated.kind,
      });
    }

    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(scanned))) {
        const specifier = m[1];
        if (!specifier.startsWith('.')) continue; // only relative specifiers
        checked++;
        if (!resolves(specifier, file)) {
          failures.push({
            file: relative(ROOT, file),
            line: lineNumberAt(scanned, m.index),
            kind: name,
            specifier,
          });
        }
      }
    }
  }

  if (scanIssues.length > 0) {
    console.error(
      `check-paths: ${scanIssues.length} file(s) desynced during scanning — an ` +
      `unterminated construct ran to end of file, so everything after it was ` +
      `NEVER CHECKED:\n`
    );
    for (const s of scanIssues) {
      console.error(`  ${s.file}:${s.line}  [unterminated ${s.kind}]`);
    }
    console.error(`\nFix the file (or, if this is a false positive, the scanner) before trusting a green run.\n`);
  }

  if (failures.length > 0) {
    console.error(`check-paths: ${failures.length} unresolved relative specifier(s):\n`);
    for (const f of failures) {
      console.error(`  ${f.file}:${f.line}  [${f.kind}]  '${f.specifier}'`);
    }
  }

  if (scanIssues.length > 0 || failures.length > 0) {
    console.error(`\nchecked ${checked} relative specifiers across ${files.length} files.`);
    process.exit(1);
  }

  console.log(`check-paths: OK — ${checked} relative specifiers resolved across ${files.length} files.`);
  process.exit(0);
}

// Only run when executed directly (`node tools/check-paths.mjs`), not when
// imported — tests/unit/tools/check-paths.test.ts imports stripComments()
// directly to exercise it against fixture strings, and importing must not
// side-effect into walking the whole repo and calling process.exit().
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}

export { stripComments, resolves, walk, PATTERNS, lineNumberAt };
