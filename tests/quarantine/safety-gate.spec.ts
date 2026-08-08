/**
 * tests/safety-gate.spec.ts
 * Verifies the Gatekeeper safety net for sensitive tool calls.
 * 
 * Target Requirements:
 * - FR-011: Gatekeeper intercepts sensitive tools
 */

import { test, expect } from '@playwright/test';

test.describe('Safety Gate & Interception', () => {
    test.beforeEach(async ({ page }) => {
        // Capture browser console logs for debugging
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('[Executor')) {
                console.log(`[Browser ${msg.type()}] ${msg.text()}`);
            }
        });

        await page.goto('/');
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        
        // Wait for system to be ready
        await page.waitForSelector('text=Files', { state: 'visible', timeout: 15000 });
    });

    test('FR-011: Sensitive tool calls are intercepted before execution', async ({ page }) => {
        const chatInput = page.locator('[data-testid="chat-input"]');
        const prompt = "Please create a new file called 'fix.txt' with contents 'Fixed.'";
        
        await chatInput.click();
        await page.keyboard.type(prompt);
        await page.keyboard.press('Enter');

        // THEN: The ApprovalRequest modal should appear (AGENT_REQUEST_APPROVAL)
        await expect(page.locator('text=PERMISSION REQUIRED')).toBeVisible({ timeout: 25000 });
        
        const history = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__.getHistory());
        const hasApprovalRequest = history.some((e: any) => e.event.type === 'AGENT_REQUEST_APPROVAL');
        expect(hasApprovalRequest).toBe(true);
    });
});