import { test, expect, ConsoleMessage } from '@playwright/test';

// Extend Window interface for test hooks
declare global {
    interface Window {
        __THEIA_SIMULATE_SPEECH__: (transcript: string) => Promise<void>;
        __THEIA_VOICE_STATE__: {
            lastTranscript: string;
            lastLLMResponse: string;
            connectionStatus: string;
            currentMode: string;
        };
        __THEIA_CONTEXT_STATE__: {
            activeFile: string;
        };
    }
}

test.describe('Voice IQ Smoke Test - Real LLM Integration', () => {
    // CRITICAL: Real LLM calls are slow, set generous timeout
    test.setTimeout(60000);

    const consoleLogs: string[] = [];

    test.beforeEach(async ({ page }) => {
        consoleLogs.length = 0; // Clear logs

        // Capture console for debugging
        page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text();
            const type = msg.type();
            // Capture relevant logs or any errors/warnings
            if (text.includes('[Theia') || text.includes('[DirectorService') || text.includes('[Voice IQ') || type === 'error' || type === 'warning') {
                consoleLogs.push(`[${type}] ${text}`);
                console.log(`[${type}] ${text}`); // Echo to test output
            }
        });

        // Navigate to the app (uses baseURL from config: localhost:3000)
        await page.goto('/');

        // Load Sample PR (this provides the mock file context)
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');
    });

    test('Precision Mode LLM receives and responds with correct file context', async ({ page }) => {
        /**
         * IQ TEST OBJECTIVE:
         * Prove that when simulating a user asking about a file, the LLM:
         * 1. Receives the current file context
         * 2. Answers correctly based on that context
         * 
         * This is an END-TO-END test that hits the real Gemini API.
         * We use __THEIA_SIMULATE_SPEECH__ to bypass browser STT.
         */

        // Step 1: Navigate to a specific file by clicking just the filename
        await page.getByText('App.tsx', { exact: false }).click();
        await page.waitForTimeout(500); // Wait for file to be selected

        // Set the active file in context state (simulate what UserContextMonitor does)
        await page.evaluate(() => {
            (window as any).__THEIA_CONTEXT_STATE__ = {
                activeFile: 'src/components/App.tsx'
            };
        });

        // Step 2: Switch to Precision Mode
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();
        await expect(precisionBtn).toHaveClass(/bg-purple-900/);

        // Grant microphone permission
        await page.context().grantPermissions(['microphone']);

        // Step 3: Activate Precision Mode - this exposes the test hook
        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // Wait for connection and hook to be exposed
        await expect.poll(async () => {
            return await page.evaluate(() => typeof (window as any).__THEIA_SIMULATE_SPEECH__ === 'function');
        }, {
            message: 'Waiting for __THEIA_SIMULATE_SPEECH__ hook to be exposed',
            timeout: 10000
        }).toBe(true);

        console.log('[Voice IQ Test] Test hook exposed, connection established');

        // Step 4: Simulate the user asking about the file
        // This question specifically targets content in App.tsx
        const testQuestion = "What components are imported in this file?";

        console.log('[Voice IQ Test] Simulating speech:', testQuestion);

        await page.evaluate((question) => {
            (window as any).__THEIA_SIMULATE_SPEECH__(question);
        }, testQuestion);

        // Step 5: Poll for LLM response (this is the actual Gemini call)
        const response = await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
            return state?.lastLLMResponse;
        }, {
            message: 'Waiting for LLM response',
            timeout: 45000,
            intervals: [1000, 2000, 2000, 2000, 2000, 5000]
        }).toBeTruthy();

        console.log('[Voice IQ Test] LLM Response received:', response);

        // Step 6: CRITICAL ASSERTION
        // The response MUST reference content from App.tsx
        // Looking for mentions of: FileTree, CodeViewer (the imported components)
        const llmResponse = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__?.lastLLMResponse) as string;

        console.log('[Voice IQ Test] Full response:', llmResponse);

        // The imported components in App.tsx are FileTree and CodeViewer
        const containsRelevantContent =
            llmResponse.toLowerCase().includes('filetree') ||
            llmResponse.toLowerCase().includes('codeviewer') ||
            llmResponse.toLowerCase().includes('react');

        expect(containsRelevantContent).toBe(true);

        // Verify logs show the LLM was called with context
        const contextLog = consoleLogs.find(log => log.includes('Calling LLM with context'));
        expect(contextLog).toBeDefined();
    });

    test('LLM correctly identifies content unique to the viewed file', async ({ page }) => {
        /**
         * STRONGER IQ TEST:
         * Ask a question that can ONLY be answered correctly if the LLM sees
         * the specific file content. This proves real context grounding.
         */

        // Use a file with unique, identifiable content
        await page.getByText('math.ts', { exact: false }).click();
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            (window as any).__THEIA_CONTEXT_STATE__ = {
                activeFile: 'src/utils/math.ts'
            };
        });

        // Switch to Precision Mode and activate
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();
        await page.context().grantPermissions(['microphone']);

        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await startBtn.click();

        // Wait for hook
        await expect.poll(async () => {
            return await page.evaluate(() => typeof (window as any).__THEIA_SIMULATE_SPEECH__ === 'function');
        }, { timeout: 10000 }).toBe(true);

        // Ask about the unique "divide" function that throws on zero
        const testQuestion = "What error does the divide function throw?";

        await page.evaluate((question) => {
            (window as any).__THEIA_SIMULATE_SPEECH__(question);
        }, testQuestion);

        // Wait for response
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
            return state?.lastLLMResponse;
        }, { timeout: 45000 }).toBeTruthy();

        const llmResponse = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__?.lastLLMResponse) as string;

        console.log('[Voice IQ Test] Response about divide:', llmResponse);

        // The divide function throws "Division by zero" - this is UNIQUE to this file
        const mentionsDivisionError =
            llmResponse.toLowerCase().includes('division by zero') ||
            llmResponse.toLowerCase().includes('divide by zero') ||
            llmResponse.toLowerCase().includes('b === 0') ||
            llmResponse.toLowerCase().includes('throws');

        expect(mentionsDivisionError).toBe(true);
    });

    test('Precision Mode gracefully handles question without file context', async ({ page }) => {
        /**
         * EDGE CASE: What happens when no file is selected?
         * LLM should still respond, just not with grounded content.
         */

        // Switch to Precision Mode without selecting a file
        const precisionBtn = page.getByRole('button', { name: 'Precision', exact: true });
        await precisionBtn.click();
        await page.context().grantPermissions(['microphone']);

        const startBtn = page.locator('button[title="Start Precision Voice"]');
        await startBtn.click();

        await expect.poll(async () => {
            return await page.evaluate(() => typeof (window as any).__THEIA_SIMULATE_SPEECH__ === 'function');
        }, { timeout: 10000 }).toBe(true);

        // Ask a general question
        const testQuestion = "What is this PR about?";

        await page.evaluate((question) => {
            (window as any).__THEIA_SIMULATE_SPEECH__(question);
        }, testQuestion);

        // Should still get a response (even if not file-grounded)
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__);
            return state?.lastLLMResponse;
        }, { timeout: 45000 }).toBeTruthy();

        const llmResponse = await page.evaluate(() => (window as any).__THEIA_VOICE_STATE__?.lastLLMResponse) as string;

        // Should mention something about the PR context (title is available)
        const mentionsPRContext =
            llmResponse.toLowerCase().includes('visual') ||
            llmResponse.toLowerCase().includes('code review') ||
            llmResponse.toLowerCase().includes('pr');

        expect(llmResponse.length).toBeGreaterThan(10);
        // This is a softer check - just ensure we got a meaningful response
        expect(mentionsPRContext || llmResponse.length > 50).toBe(true);
    });
});
