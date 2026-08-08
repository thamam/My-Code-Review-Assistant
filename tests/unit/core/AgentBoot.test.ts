import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Boot gate (Stage A, step 2): with no VITE_GEMINI_API_KEY set (the
 * authentic state of this worktree — no .env present), the app's module
 * graph must import without throwing.
 *
 * Before the fix, `TheiaAgent`'s constructor eagerly called `getGenAI()`,
 * which constructs `new GoogleGenAI({ apiKey: undefined })`. In the real
 * browser bundle that Vite ships (the `browser` export condition of
 * @google/genai) that constructor throws "An API Key must be set when
 * running in a browser". Because `export const agent = new TheiaAgent()`
 * runs at module scope, that throw killed the whole React tree before
 * anything rendered — a white screen for anyone without the key set.
 *
 * vitest resolves @google/genai's `node` export condition, which doesn't
 * hit that browser-only guard, so an import-only test can't reproduce the
 * throw here. The deterministic regression guard is: constructing
 * TheiaAgent must not eagerly touch the GenAI client at all.
 */
describe('TheiaAgent boot without an API key', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not construct the GenAI client during TheiaAgent construction', async () => {
    vi.doMock('../../../src/modules/core/genaiClient', () => ({
      getGenAI: vi.fn(() => {
        throw new Error('getGenAI() must not be called eagerly at construction time');
      }),
    }));

    const { TheiaAgent } = await import('../../../src/modules/core/Agent');
    expect(() => new TheiaAgent()).not.toThrow();
  });

  it("imports the app's module graph (App.tsx) without VITE_GEMINI_API_KEY set", async () => {
    // vi.resetModules() (in beforeEach) clears the module registry but does
    // NOT clear mock registrations, so the doMock from the previous test
    // would otherwise leak in here and this test would import App.tsx
    // against a stubbed genaiClient instead of the real one — silently
    // passing regardless of whether the real genaiClient.ts throws at
    // module scope. Explicitly unmock it so this test exercises the real
    // module graph, which is the entire point of this boot gate.
    vi.doUnmock('../../../src/modules/core/genaiClient');

    expect(import.meta.env.VITE_GEMINI_API_KEY).toBeUndefined();
    await expect(import('../../../App')).resolves.toBeDefined();
  });
});
