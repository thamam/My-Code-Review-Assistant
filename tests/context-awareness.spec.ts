import { test, expect } from '@playwright/test';

test.describe('Context Awareness System', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to local instance (Ensure npm start is running)
        await page.goto('http://localhost:3000');

        // Load the Sample PR to ensure we have a consistent UI state
        // We wait for the button to be visible to avoid race conditions
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');

        // Wait for the PR title to appear, confirming load
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('Theia detects Active Tab change', async ({ page }) => {
        // 1. Switch to Annotations Tab
        await page.click('button[title="Annotations"]');

        // 2. Check internal state via the injected global debug object
        // We poll briefly because state updates might be debounced/async
        await expect.poll(async () => {
            return await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__?.activeTab);
        }, { timeout: 2000 }).toBe('annotations');
    });

    test('Theia detects File Selection', async ({ page }) => {
        // 1. Open a specific file
        // Note: FileTree renders nested structure, so we select the leaf node
        // We use getByText with exact: true to avoid matching "src" or "utils" if they contained "math.ts" (unlikely but safe)
        await page.getByText('math.ts', { exact: false }).click();

        // 2. Verify Context Update
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeFile;
        }, { timeout: 2000 }).toContain('src/utils/math.ts');
    });

    test('Theia detects Code Selection', async ({ page }) => {
        // 1. Navigate to file
        await page.getByText('math.ts', { exact: false }).click();

        // 2. Select text (Simulate user selection by clicking a line number)
        // We use .last() because data-line-number appears in both Gutter and CodeArea.
        // The CodeArea is the one we want to click for simplified selection.
        const lineLocator = page.locator('[data-line-number="1"]').last();
        await lineLocator.waitFor({ state: 'visible', timeout: 5000 });

        // Use dblclick to select the word/line, which triggers the range selection logic
        // This is more reliable than single click which might be flaky with event delegation
        await lineLocator.dblclick();

        // 3. Verify Context Update
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_CONTEXT_STATE__);
            return state?.activeSelection;
        }, { timeout: 2000 }).toBeTruthy();
    });
});
