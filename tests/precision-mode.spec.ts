import { test, expect } from '@playwright/test';

test.describe('Precision Mode & Logging', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        // Load Sample PR
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('Conversation Export generates a JSON file', async ({ page }) => {
        // Find export button
        const exportBtn = page.locator('button[title="Export Session JSON"]');
        await expect(exportBtn).toBeVisible();

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click export
        await exportBtn.click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('theia-session-');
        expect(download.suggestedFilename()).toContain('.json');

        // Verify content (optional, but good)
        const path = await download.path();
        if (path) {
            const fs = require('fs');
            const content = fs.readFileSync(path, 'utf8');
            const json = JSON.parse(content);
            expect(json).toHaveProperty('pr');
            expect(json).toHaveProperty('messages');
        }
    });

    test('Precision Mode Toggle switches UI state', async ({ page }) => {
        // Check initial state (Live)
        const liveBtn = page.getByRole('button', { name: 'Live', exact: true });
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });

        await expect(liveBtn).toHaveClass(/bg-amber-900/);
        await expect(precisionBtn).not.toHaveClass(/bg-purple-900/);

        // Switch to Precision
        await precisionBtn.click();

        // Verify state change
        await expect(liveBtn).not.toHaveClass(/bg-amber-900/);
        await expect(precisionBtn).toHaveClass(/bg-purple-900/);

        // Verify main button text changes
        const mainBtn = page.locator('button[title="Start Precision Voice"]');
        await expect(mainBtn).toBeVisible();
        await expect(mainBtn).toContainText('Start Precision');
    });
});
