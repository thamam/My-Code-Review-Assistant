#!/usr/bin/env node
/**
 * tools/check-paths.mjs
 *
 * Walks every relative module specifier ('./...' or '../...') appearing in
 * a module position across the repo's .ts/.tsx/.js/.mjs sources, and
 * asserts each one resolves to a real file on disk.
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
 * Exit 0 = every relative specifier resolved. Exit 1 = at least one did not
 * (details printed to stderr).
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

/**
 * Crude but sufficient comment stripper: blanks out block comments and
 * line comments so they can't produce spurious specifier matches, while
 * preserving line numbers (replaces comment bodies with spaces, keeps
 * newlines intact). Not string-literal-aware, but false positives from a
 * '//' or '/*' inside a string are rare in practice and the failure mode
 * (a spurious extra specifier to check) fails loud, not silent.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '`') {
      // Skip template literals wholesale (they commonly embed code-as-text,
      // e.g. shell scripts, which is not a real module specifier).
      out += ' ';
      i++;
      while (i < n && src[i] !== '`') {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ' ';
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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
  let checked = 0;

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const scanned = stripComments(raw);

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

  if (failures.length > 0) {
    console.error(`check-paths: ${failures.length} unresolved relative specifier(s):\n`);
    for (const f of failures) {
      console.error(`  ${f.file}:${f.line}  [${f.kind}]  '${f.specifier}'`);
    }
    console.error(`\nchecked ${checked} relative specifiers across ${files.length} files.`);
    process.exit(1);
  }

  console.log(`check-paths: OK — ${checked} relative specifiers resolved across ${files.length} files.`);
  process.exit(0);
}

main();
