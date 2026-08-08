/**
 * smoke-test.ts — Session Parser smoke test
 *
 * Usage: npx tsx src/lib/session-parser/smoke-test.ts [path-to-jsonl]
 *
 * If no path is given, uses the largest available session from
 * ~/.claude/projects/ as a default test target.
 */

import { parseSessionFile, summarizeSession } from './parser';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function findBestTestSession(): Promise<string | null> {
  const projectsDir = join(homedir(), '.claude', 'projects');

  let best: { path: string; size: number } | null = null;

  try {
    const projects = await readdir(projectsDir);
    for (const project of projects) {
      const projectPath = join(projectsDir, project);
      try {
        const files = await readdir(projectPath);
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const filePath = join(projectPath, file);
          const info = await stat(filePath);
          if (!best || info.size > best.size) {
            best = { path: filePath, size: info.size };
          }
        }
      } catch {
        // Skip unreadable project dirs
      }
    }
  } catch {
    return null;
  }

  return best?.path ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  let jsonlPath = args[0];

  if (!jsonlPath) {
    console.log('No JSONL path provided — finding best test session…');
    const found = await findBestTestSession();
    if (!found) {
      console.error('No JSONL sessions found in ~/.claude/projects/');
      process.exit(1);
    }
    jsonlPath = found;
    console.log(`Using: ${jsonlPath}`);
  }

  console.log(`\nParsing session: ${jsonlPath}`);
  const start = Date.now();

  const session = await parseSessionFile(jsonlPath);
  const elapsed = Date.now() - start;

  console.log(summarizeSession(session));
  console.log(`Parsed in ${elapsed}ms`);

  // Exit code 0 = success
  process.exit(0);
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
