import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Was 'tests/unit/**/*.test.ts' — silently dropped any *.test.tsx file
    // (green suite, zero coverage for it). No .test.tsx exists in this repo
    // today (verified), but widen the glob so the miss can't recur silently.
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
