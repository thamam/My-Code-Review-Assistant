import { test, expect } from '@playwright/test';

/**
 * Boot Smoke — end-to-end proof of Stage A's boot fix.
 *
 * The app must mount and become interactive with NO Gemini API key present
 * (no .env in this worktree, VITE_GEMINI_API_KEY unset). Before Stage A,
 * constructing the GoogleGenAI client eagerly at module load could throw
 * during the app's module graph evaluation; genaiClient.ts now constructs
 * it lazily on first use instead, so simply mounting the app and loading
 * sample data — never calling the LLM — must not touch that code path.
 *
 * This test does not mock any network endpoint and does not set an API
 * key. Loading the sample PR is entirely local (src/mock/samplePR.ts), so
 * it does not require one either.
 */

test.describe('Boot Smoke', () => {
  test('mounts with no API key, logs no console errors, and Load Sample renders the file tree', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Chrome logs a generic "Failed to load resource: 404" console.error
      // for the browser's own implicit /favicon.ico request — this repo
      // ships no favicon link tag, and that has nothing to do with the
      // app's boot path. Ignore it; keep everything else.
      const url = msg.location()?.url ?? '';
      if (url.endsWith('/favicon.ico')) return;
      consoleErrors.push(`${msg.text()} (${url})`);
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');

    // The welcome screen (unauthenticated, no key) must render.
    const loadSampleButton = page.locator('button:has-text("Load Sample PR")');
    await expect(loadSampleButton).toBeVisible({ timeout: 10000 });

    await loadSampleButton.click();

    // The sample PR's file tree renders — proves PRContext/FileTree mounted
    // past the welcome screen using only local mock data.
    await expect(page.getByText('math.ts')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('App.tsx')).toBeVisible();

    expect(consoleErrors, `console.error() calls during boot: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `uncaught page errors during boot: ${pageErrors.join('\n')}`).toEqual([]);
  });
});
