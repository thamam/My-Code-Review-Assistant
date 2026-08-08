import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest runs TypeScript directly (no emit step), but the source files use
 * `.js` extensions in imports — correct for ESM compilation but unresolvable
 * at test time. This plugin rewrites `.js` → `.ts` so vitest can find them.
 */
const resolveTypeScriptExtensions = {
  name: 'resolve-ts-extensions',
  async resolveId(id, importer) {
    if (id.endsWith('.js') && importer) {
      const tsId = id.slice(0, -3) + '.ts';
      const resolved = await this.resolve(tsId, importer, { skipSelf: true });
      if (resolved) return resolved;
    }
  },
};

export default defineConfig({
  plugins: [resolveTypeScriptExtensions],
  test: {
    globals: false,
    environment: 'node',
    // Was 'tests/unit/**/*.test.ts' — silently dropped any *.test.tsx file
    // (green suite, zero coverage for it). No .test.tsx exists in this repo
    // today (verified), but widen the glob so the miss can't recur silently.
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
