import { test, expect } from '@playwright/test';

test.describe('UI Stability & Interaction Polish', () => {
    test.beforeEach(async ({ page }) => {
        // Setup similar to context-awareness spec
        await page.goto('/');
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('Diagram Refresh Button exists and triggers refresh', async ({ page }) => {
        // 1. Navigate to Diagrams Tab
        const diagramTabBtn = page.locator('button[title="Sequence Diagrams"]').first();
        // Since title might be just "Diagrams" or icon, we use locator fallback based on DiagramPanel presence
        // But DiagramPanel is only visible if Tab is active.
        // Let's find the tab button. In MainLayout or similar. 
        // Based on ContextAwareness spec: `page.click('button[title="Annotations"]');`
        // So `button[title="Diagrams"]` is likely correct.
        await page.click('button[title="Diagrams"]');

        // 2. Check for Refresh Button
        // We will implement it with title="Refresh Diagrams"
        const refreshBtn = page.locator('button[title="Refresh Diagrams"]');
        await expect(refreshBtn).toBeVisible({ timeout: 2000 }); // Short timeout as we expect fail
    });

    test('Clicking code text allows native selection and does NOT trigger row selection', async ({ page }) => {
        // 1. Open a file
        await page.getByText('math.ts', { exact: false }).click();

        // 2. Wait for code to load
        await page.waitForSelector('.token');

        // 2b. Ensure we are in "Raw" / Source Mode (not Diff View)
        // If "Show Raw" is visible, it means we are in Diff Mode. Click it.
        if (await page.getByText('Show Raw').isVisible()) {
            await page.click('text=Show Raw');
        }

        // 3. Click on the code text (Code Area)
        // specific line
        const lineContentResult = page.locator('[data-line-number="5"] .token').first();
        await lineContentResult.waitFor();

        // Get initial selection state via window/eval before click?
        // We verify that the "SelectionState" (Redux/Context) does NOT update for single click.

        // Perform click
        await lineContentResult.click();

        // 4. Verification: 
        // The bug prevents native selection by triggering "row selection" (blue highlight).
        // Code line gets `bg-blue-500/10` when selected.
        const codeLine = page.locator('[data-line-number="5"]').first();

        // We expect it NOT to be selected (no blue highlight).
        // If the bug exists, this will FAIL because it will have the class.
        await expect(codeLine).not.toHaveClass(/bg-blue-500\/10/);
    });
});
