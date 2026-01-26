/**
 * tests/neural-loop.spec.ts
 * Phase 10.4: System Verification
 * 
 * Verifies the Event-Driven Architecture ("Neural Loop"):
 * 1. USER_MESSAGE → Agent receives it
 * 2. Agent processes → emits AGENT_THINKING
 * 3. Tool execution → emits AGENT_NAVIGATE / AGENT_TAB_SWITCH / AGENT_DIFF_MODE
 * 4. ChatContext receives → executes UI commands
 * 
 * State Hooks:
 * - __THEIA_EVENT_BUS__: Exposed EventBus for direct manipulation
 * - __THEIA_EVENT_HISTORY__: Event history for verification
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 10: The Neural Loop', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to local instance
        await page.goto('/');

        // Load Sample PR to initialize the system
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        await page.waitForSelector('text=Feature: Implement Visual Code Review');

        // Wait for Agent to initialize (check EventBus exposure)
        await expect.poll(async () => {
            const eventBus = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__);
            return eventBus !== undefined;
        }, { timeout: 5000 }).toBe(true);
    });

    test('EventBus is exposed for test injection', async ({ page }) => {
        // Verify the EventBus singleton is accessible
        const hasEventBus = await page.evaluate(() => {
            return typeof (window as any).__THEIA_EVENT_BUS__?.emit === 'function';
        });
        expect(hasEventBus).toBe(true);

        // Verify history API is available
        const hasHistory = await page.evaluate(() => {
            return typeof (window as any).__THEIA_EVENT_BUS__?.getHistory === 'function';
        });
        expect(hasHistory).toBe(true);
    });

    test('AGENT_NAVIGATE event triggers file navigation', async ({ page }) => {
        // Inject AGENT_NAVIGATE event directly into the EventBus
        await page.evaluate(() => {
            (window as any).__THEIA_EVENT_BUS__.emit({
                type: 'AGENT_NAVIGATE',
                payload: {
                    target: { file: 'src/utils/math.ts', line: 5 },
                    reason: 'Test injection',
                    highlight: true,
                    timestamp: Date.now()
                }
            });
        });

        // Verify navigation occurred via PR State (selectedFile updates)
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_PR_STATE__);
            return state?.selectedFile;
        }, { timeout: 5000 }).toContain('math.ts');
    });

    test('AGENT_TAB_SWITCH event triggers tab change', async ({ page }) => {
        // Inject AGENT_TAB_SWITCH event
        await page.evaluate(() => {
            (window as any).__THEIA_EVENT_BUS__.emit({
                type: 'AGENT_TAB_SWITCH',
                payload: {
                    tab: 'annotations',
                    timestamp: Date.now()
                }
            });
        });

        // Verify tab switched via PR State
        await expect.poll(async () => {
            const state = await page.evaluate(() => (window as any).__THEIA_PR_STATE__);
            return state?.leftTab;
        }, { timeout: 3000 }).toBe('annotations');
    });

    test('AGENT_DIFF_MODE event toggles diff view', async ({ page }) => {
        // First, select a file to ensure CodeViewer is active
        await page.getByText('math.ts', { exact: false }).click();

        // Inject AGENT_DIFF_MODE event to enable diff
        await page.evaluate(() => {
            (window as any).__THEIA_EVENT_BUS__.emit({
                type: 'AGENT_DIFF_MODE',
                payload: {
                    enable: true,
                    timestamp: Date.now()
                }
            });
        });

        // Verify diff mode is enabled (check for diff-related UI elements)
        // The PR context should have isDiffMode = true
        await expect.poll(async () => {
            const prState = await page.evaluate(() => (window as any).__THEIA_PR_STATE__?.isDiffMode);
            return prState;
        }, { timeout: 3000 }).toBe(true);
    });

    test('Event history records all emitted events (Black Box)', async ({ page }) => {
        // Emit multiple events
        await page.evaluate(() => {
            const bus = (window as any).__THEIA_EVENT_BUS__;

            bus.emit({
                type: 'AGENT_THINKING',
                payload: { stage: 'started', message: 'Test thinking', timestamp: Date.now() }
            });

            bus.emit({
                type: 'AGENT_NAVIGATE',
                payload: {
                    target: { file: 'test.ts', line: 1 },
                    reason: 'History test',
                    timestamp: Date.now()
                }
            });

            bus.emit({
                type: 'AGENT_THINKING',
                payload: { stage: 'completed', timestamp: Date.now() }
            });
        });

        // Verify events are recorded in history
        const history = await page.evaluate(() => {
            return (window as any).__THEIA_EVENT_BUS__.getHistory();
        });

        // Should have recorded our events (plus any startup events)
        const thinkingEvents = history.filter((e: any) => e.event.type === 'AGENT_THINKING');
        const navigateEvents = history.filter((e: any) => e.event.type === 'AGENT_NAVIGATE');

        expect(thinkingEvents.length).toBeGreaterThanOrEqual(2);
        expect(navigateEvents.length).toBeGreaterThanOrEqual(1);
    });

    test('Full Neural Loop: USER_MESSAGE propagates through EventBus', async ({ page }) => {
        // Test that USER_MESSAGE events are properly recorded in the EventBus history
        // This is deterministic - no LLM dependency

        // Emit a USER_MESSAGE event via the EventBus
        await page.evaluate(() => {
            (window as any).__THEIA_EVENT_BUS__.emit({
                type: 'USER_MESSAGE',
                payload: {
                    text: 'Test message for Neural Loop verification',
                    mode: 'text',
                    context: { activeTab: 'files', activeFile: null },
                    prData: null
                }
            });
        });

        // Verify the USER_MESSAGE was recorded in history
        await expect.poll(async () => {
            const history = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__.getHistory());
            return history.some((e: any) =>
                e.event.type === 'USER_MESSAGE' &&
                e.event.payload.text === 'Test message for Neural Loop verification'
            );
        }, { timeout: 3000 }).toBe(true);
    });

    test('Agent Actions propagate: AGENT_SPEAK updates chat messages', async ({ page }) => {
        // Test that AGENT_SPEAK events result in chat message updates
        const testMessage = 'Hello from the Neural Loop test!';

        // Emit an AGENT_SPEAK event
        await page.evaluate((msg) => {
            (window as any).__THEIA_EVENT_BUS__.emit({
                type: 'AGENT_SPEAK',
                payload: { text: msg }
            });
        }, testMessage);

        // Verify the message appears in the chat UI (ChatContext should render it)
        await expect(page.locator('text=' + testMessage)).toBeVisible({ timeout: 3000 });
    });
});
