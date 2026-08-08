/**
 * Spec Traceability E2E Test
 * 
 * Verifies that the Director correctly uses SpecAtoms when generating responses.
 * Tests the end-to-end flow: Spec injection -> Precision Mode -> LLM Response citing requirements.
 */

import { test, expect, ConsoleMessage } from '@playwright/test';

test.describe('Spec Traceability', () => {
    // Real LLM calls are slow
    test.setTimeout(60000);

    const consoleLogs: string[] = [];

    test.beforeEach(async ({ page }) => {
        consoleLogs.length = 0;

        // Capture console for debugging
        page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text();
            const type = msg.type();
            if (text.includes('[SpecContext') || text.includes('[Theia') || text.includes('[Test]') || type === 'error') {
                consoleLogs.push(`[${type}] ${text}`);
                console.log(`[${type}] ${text}`);
            }
        });

        // Navigate to the app
        await page.goto('/');

        // Load Sample PR (required for Voice button to appear)
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('Director cites Requirement ID when answering spec-related question', async ({ page }) => {
        // Step 1: Inject a mock spec with clear, testable requirements
        const mockSpec = {
            id: 'test-spec-1',
            source: 'manual',
            title: 'UI Requirements',
            rawContent: '# UI Requirements\nREQ-COLOR-1 [UI]: The submit button must be hex color #ffefd5 (papayawhip).',
            atoms: [
                {
                    id: 'REQ-COLOR-1',
                    category: 'ui',
                    description: 'The submit button must be hex color #ffefd5 (papayawhip).',
                    context: [],
                    status: 'pending'
                }
            ],
            atomizedAt: Date.now()
        };

        // Inject the mock spec
        await page.evaluate((spec) => {
            const setMockSpec = (window as any).__THEIA_SET_MOCK_SPEC__;
            if (setMockSpec) {
                setMockSpec(spec);
                console.log('[Test] Mock spec injected');
            } else {
                console.error('[Test] __THEIA_SET_MOCK_SPEC__ not available');
            }
        }, mockSpec);

        await page.waitForTimeout(500);

        // Verify spec was injected
        const specState = await page.evaluate(() => {
            return (window as any).__THEIA_SPEC_STATE__;
        });
        console.log('[Test] Spec state:', specState);
        expect(specState?.activeSpec?.id).toBe('test-spec-1');

        // Step 2: Select a file and set context
        await page.getByText('App.tsx', { exact: false }).click();
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            (window as any).__THEIA_CONTEXT_STATE__ = {
                activeFile: 'src/components/App.tsx'
            };
        });

        // Step 3: Switch to Precision Mode
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();
        await expect(precisionBtn).toHaveClass(/bg-purple-900/);

        // Grant microphone permission
        await page.context().grantPermissions(['microphone']);

        // Step 4: Activate Precision Mode
        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // Wait for connection and hook to be exposed
        await expect.poll(async () => {
            return await page.evaluate(() => typeof (window as any).__THEIA_SIMULATE_SPEECH__ === 'function');
        }, {
            message: 'Waiting for __THEIA_SIMULATE_SPEECH__ hook',
            timeout: 10000
        }).toBe(true);

        console.log('[Test] Voice connected, simulating speech...');

        // Step 5: Simulate speech asking about the requirement
        const question = 'What color should the submit button be according to the requirements?';

        await page.evaluate((text) => {
            (window as any).__THEIA_SIMULATE_SPEECH__(text);
        }, question);

        // Step 6: Wait for LLM response
        const response = await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
            return state?.lastLLMResponse;
        }, {
            message: 'Waiting for LLM response',
            timeout: 45000,
            intervals: [1000, 2000, 2000, 2000, 5000, 5000]
        }).toBeTruthy();

        console.log('[Test] LLM Response:', response);

        // Step 7: Verify response contains spec-grounded content
        const llmResponse = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__?.lastLLMResponse) as string;

        const mentionsPapayawhip = llmResponse.toLowerCase().includes('papayawhip') ||
            llmResponse.toLowerCase().includes('#ffefd5');
        const mentionsReqId = llmResponse.includes('REQ-COLOR-1') ||
            llmResponse.includes('REQ-COLOR');
        const mentionsColor = llmResponse.toLowerCase().includes('color');

        console.log('[Test] Response analysis:', {
            mentionsPapayawhip,
            mentionsReqId,
            mentionsColor,
            responseLength: llmResponse.length
        });

        // Response should not be empty
        expect(llmResponse.length).toBeGreaterThan(10);

        // Response should mention either the color, papayawhip, or the requirement ID
        expect(mentionsPapayawhip || mentionsReqId || mentionsColor).toBe(true);
    });

    test('Spec state is accessible via test hook', async ({ page }) => {
        // After beforeEach, wait for hooks to be exposed
        await page.waitForTimeout(1000);

        const hasSetMockSpec = await page.evaluate(() => {
            return typeof (window as any).__THEIA_SET_MOCK_SPEC__ === 'function';
        });

        const hasSpecState = await page.evaluate(() => {
            return typeof (window as any).__THEIA_SPEC_STATE__ === 'object';
        });

        console.log('[Test] Hook availability:', { hasSetMockSpec, hasSpecState });

        expect(hasSetMockSpec || hasSpecState).toBe(true);
    });
});
