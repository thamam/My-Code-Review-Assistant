import { test, expect } from '@playwright/test';

/**
 * Story 1: The Explorer - Diagram Navigation E2E Test
 * 
 * User Story: "As a reviewer, I want to see a visual diagram of the Agent 
 * architecture and click on nodes to navigate directly to the code."
 * 
 * Kill Criteria:
 * - Mermaid SVG appears within 10 seconds
 * - Clicking a .clickable-ref node changes the active Editor file
 */

test.describe('Story 1: The Explorer - Diagram Navigation', () => {

    test.beforeEach(async ({ page }) => {
        // Capture browser console logs for debugging
        page.on('console', msg => {
            console.log(`[Browser ${msg.type()}] ${msg.text()}`);
        });

        // Navigate to the application
        await page.goto('/');

        // The app shows a landing page first - click "Load Sample PR" to enter main UI
        const loadSampleButton = page.locator('button:has-text("Load Sample PR")');
        await expect(loadSampleButton).toBeVisible({ timeout: 10000 });
        await loadSampleButton.click();

        // Wait for the main application to fully load
        await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });
    });

    test('should render Mermaid diagram when user asks for architecture', async ({ page }) => {
        // Step 1: Find and interact with chat input
        const chatInput = page.locator('[data-testid="chat-input"], .chat-input, textarea').first();
        await expect(chatInput).toBeVisible({ timeout: 5000 });

        // Mock the Agent response to bypass LLM latency and Gatekeeper
        await page.evaluate(() => {
            const bus = (window as any).__THEIA_EVENT_BUS__;
            if (bus) {
                const dualTrack = JSON.stringify({
                    voice: "Here is the architecture diagram.",
                    screen: "Here is the diagram:\n\n```mermaid\ngraph TD\n    A[App] -->|Render| B(DiffView)\n    B -->|Click| C{Agent}\n```"
                });
                bus.emit({
                    type: 'AGENT_SPEAK',
                    payload: {
                        text: dualTrack
                    }
                });
            } else {
                console.error('__THEIA_EVENT_BUS__ not found');
            }
        });

        // Step 4: Wait for Mermaid SVG to appear (Kill Criterion 1)
        const mermaidSvg = page.locator('.mermaid svg, [data-testid="mermaid-diagram"] svg');
        await expect(mermaidSvg).toBeVisible({ timeout: 10000 });

        console.log('✅ Kill Criterion 1 PASSED: Mermaid SVG appeared');
    });

    test('should navigate to code when clicking diagram node', async ({ page }) => {
        // Ensure chat is ready
        const chatInput = page.locator('[data-testid="chat-input"]').first();
        await expect(chatInput).toBeVisible();

        // Mock Agent response with a diagram containing a VALID FILE REFERENCE
        await page.evaluate(() => {
            const bus = (window as any).__THEIA_EVENT_BUS__;
            if (bus) {
                // Simulate user asking (to clear state if needed)
                // Then immediately simulate agent response
                const dualTrack = JSON.stringify({
                    voice: "Here is the detailed flow.",
                    screen: "Flow with links:\n\n```mermaid\ngraph TD\n    A[Start] -->|Go§src/modules/core/Agent.ts:10| B(End)\n```"
                });
                bus.emit({
                    type: 'AGENT_SPEAK',
                    payload: {
                        text: dualTrack
                    }
                });
            }
        });

        // Wait for diagram to render
        const mermaidSvg = page.locator('.mermaid svg, [data-testid="mermaid-diagram"] svg');
        await expect(mermaidSvg).toBeVisible({ timeout: 10000 });

        // Find the clickable message/edge
        const clickableNode = page.locator('.clickable-ref').first();
        
        // Wait for it to be attached
        await expect(clickableNode).toBeVisible({ timeout: 10000 });

        // Capture initial active tab (likely 'README.md' or similar)
        const initialTab = await page.locator('[data-testid="active-file-tab"], .file-tab.active').textContent().catch(() => '');
        console.log(`Initial Tab: ${initialTab}`);

        // Click the node
        await clickableNode.click({ force: true });

        // Wait for navigation update
        await page.waitForTimeout(1000);

        // Verify tab changed to Agent.ts
        const currentTab = await page.locator('[data-testid="active-file-tab"], .file-tab.active').textContent().catch(() => '');
        console.log(`Current Tab: ${currentTab}`);

        expect(currentTab).toContain('Agent.ts');
        console.log('✅ Kill Criterion 2 PASSED: Diagram node click triggered navigation');
    });

});
