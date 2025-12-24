import { test, expect, ConsoleMessage } from '@playwright/test';

test.describe('Precision Mode & Logging', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3001');
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

    test('Precision Mode enters correct code path on activation', async ({ page }) => {
        // THIS TEST WILL FAIL if the stale closure bug returns
        // It verifies that clicking "Start Precision" actually enters the Precision branch

        const consoleLogs: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            if (msg.text().includes('[Theia')) {
                consoleLogs.push(msg.text());
            }
        });

        // Switch to Precision mode
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();

        // Verify mode changed in UI
        await expect(precisionBtn).toHaveClass(/bg-purple-900/);

        // Mock microphone permission to auto-grant (Playwright does this by default on some configs)
        // Grant microphone permission
        await page.context().grantPermissions(['microphone']);

        // Click "Start Precision" button
        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // Wait for speech recognition to initialize
        await page.waitForTimeout(3000);

        // === CRITICAL ASSERTIONS ===
        // These verify the ACTUAL code path was executed

        // 1. connect() was called with correct mode
        const connectLog = consoleLogs.find(log => log.includes('connect() called'));
        expect(connectLog).toBeDefined();
        expect(connectLog).toContain('precision');

        // 2. Precision Mode branch was entered
        const branchLog = consoleLogs.find(log => log.includes('Entering Precision Mode branch'));
        expect(branchLog).toBeDefined();

        // 3. Either recognition started OR an expected error occurred
        const recognitionStarted = consoleLogs.some(log => log.includes('Recognition started'));
        const recognitionError = consoleLogs.some(log => log.includes('Recognition error'));

        // At least one of these should be true - confirms the code ran
        expect(recognitionStarted || recognitionError).toBe(true);
    });

    test('Live Mode enters correct code path on activation', async ({ page }) => {
        const consoleLogs: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            if (msg.text().includes('[Theia')) {
                consoleLogs.push(msg.text());
            }
        });

        // Should already be in Live mode by default
        const liveBtn = page.getByRole('button', { name: 'Live', exact: true });
        await expect(liveBtn).toHaveClass(/bg-amber-900/);

        // Grant microphone permission
        await page.context().grantPermissions(['microphone']);

        // Click Voice Review button
        const voiceBtn = page.locator('button[title="Start Live Voice"]');
        await expect(voiceBtn).toBeVisible();
        await voiceBtn.click();

        // Wait for connection attempt
        await page.waitForTimeout(3000);

        // Verify connect() was called with "live" mode
        const connectLog = consoleLogs.find(log => log.includes('connect() called'));
        expect(connectLog).toBeDefined();
        expect(connectLog).toContain('live');

        // Verify it says "Initiating (live mode)"
        const initiatingLog = consoleLogs.find(log => log.includes('Initiating (live mode)'));
        expect(initiatingLog).toBeDefined();
    });

    test('Mode change updates modeRef before connect is called', async ({ page }) => {
        // This test specifically targets the stale closure bug fix
        const consoleLogs: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            if (msg.text().includes('[Theia')) {
                consoleLogs.push(msg.text());
            }
        });

        await page.context().grantPermissions(['microphone']);

        // Start in Live mode, switch to Precision, immediately click connect
        // This is the scenario where stale closure bugs appear

        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();

        // Immediately try to connect (this is where stale closures fail)
        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await startBtn.click();

        await page.waitForTimeout(2000);

        // The mode in the log MUST be "precision", not "live"
        const connectLog = consoleLogs.find(log => log.includes('connect() called'));
        expect(connectLog).not.toContain('currentMode: live');
        expect(connectLog).toContain('precision');
    });
});

