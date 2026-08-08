import { test, expect } from '@playwright/test';

/**
 * Director/Actor E2E Tests - REFACTORED
 * 
 * Uses Deterministic State Inspection instead of fragile console.log parsing.
 * 
 * State Hooks:
 * - __THEIA_CONTEXT_STATE__: Active file, tab, selection (from ChatContext)
 * - __THEIA_VOICE_STATE__: Voice mode status, transcripts (from LiveContext)
 */

test.describe('Director/Actor Architecture', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to local instance
        await page.goto('/');

        // Load Sample PR
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('UserContextMonitor updates activeFile on file selection', async ({ page }) => {
        // Select a file from the sample PR (math.ts is in src/utils/)
        await page.getByText('math.ts', { exact: false }).click();

        // Verify context state is updated via State Inspector
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeFile;
        }, { timeout: 3000 }).toContain('math.ts');
    });

    test('Director context state updates on file change', async ({ page }) => {
        // Select a file with content (math.ts has newContent)
        await page.getByText('math.ts', { exact: false }).click();

        // Use State Inspector to verify context update (deterministic, no debounce flakes)
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeFile;
        }, { timeout: 3000 }).toContain('math.ts');

        // Verify the activeTab is 'files' (file selection should keep us on files tab)
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeTab;
        }, { timeout: 2000 }).toBe('files');
    });

    test('Multiple rapid file switches result in final state (latest-wins)', async ({ page }) => {
        // Rapidly switch files from sample PR (A -> B -> C)
        // Files in sample: math.ts, App.tsx, client.ts
        await page.getByText('math.ts', { exact: false }).click();
        await page.getByText('App.tsx', { exact: false }).click();
        await page.getByText('client.ts', { exact: false }).click();

        // Use State Inspector: final state should be the LAST file clicked
        // No need for waitForTimeout - poll handles the timing deterministically
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeFile;
        }, { timeout: 3000 }).toContain('client.ts');
    });

    test('LiveContext exposes Voice State Inspector', async ({ page }) => {
        // Verify Voice State Inspector is exposed in dev mode
        await expect.poll(async () => {
            const voiceState = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
            return voiceState !== undefined;
        }, { timeout: 3000 }).toBe(true);

        // Verify initial voice state structure
        const voiceState = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
        expect(voiceState).toHaveProperty('connectionStatus');
        expect(voiceState).toHaveProperty('currentMode');
        expect(voiceState.connectionStatus).toBe('disconnected'); // Initially not connected
    });

    test('Voice Review button is visible when PR is loaded', async ({ page }) => {
        // Verify Voice Review button exists (rendered by LiveContext consumer)
        const voiceButton = page.locator('button').filter({ hasText: /Voice|voice/i }).first();
        await expect(voiceButton).toBeVisible({ timeout: 5000 });

        // Verify Voice State shows disconnected before clicking
        const voiceState = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
        expect(voiceState.connectionStatus).toBe('disconnected');
    });
});
