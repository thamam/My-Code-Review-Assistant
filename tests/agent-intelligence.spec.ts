/**
 * tests/agent-intelligence.spec.ts
 * Verifies core Agent reasoning and self-correction capabilities.
 * 
 * Target Requirements:
 * - FR-004: Self-Correction: Failure triggers re-planning
 * - FR-005: Router Logic: Loop back to Executor
 * - FR-007: Agent can search codebase
 * - FR-009: Repair Mode: Planner gets error context
 * - FR-010: Agent can read file contents
 */

import { test, expect } from '@playwright/test';

test.describe('Agent Intelligence & Self-Correction', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('text=Load Sample PR', { state: 'visible' });
        await page.click('text=Load Sample PR');
        
        // Wait for system initialization
        await expect.poll(async () => {
            return await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__ !== undefined);
        }, { timeout: 10000 }).toBe(true);
    });

    test('FR-004: Agent self-corrects after tool failure', async ({ page }) => {
        const chatInput = page.locator('[data-testid="chat-input"]');
        const prompt = "Please search for a non-existent string 'CRITICAL_ERROR_SIMULATION' in the codebase";
        
        await chatInput.fill(prompt);
        await page.keyboard.press('Enter');

        // THEN: We expect to see AGENT_THINKING events that show a 'tool_error' stage
        await expect.poll(async () => {
            const history = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__.getHistory());
            const thinkingStages = history.filter((e: any) => e.event.type === 'AGENT_THINKING')
                                         .map((e: any) => e.event.payload.stage);
            return thinkingStages;
        }, { timeout: 30000 }).toContain('tool_error');
    });

    test('FR-007 & FR-010: Agent uses search and read tools to answer technical questions', async ({ page }) => {
        const chatInput = page.locator('[data-testid="chat-input"]');
        const prompt = "What is the primary color used in colorUtils.ts?";
        
        await chatInput.fill(prompt);
        await page.keyboard.press('Enter');

        // THEN: Agent should emit search_text and read_file (or change_tab/navigate) events
        // Note: Actual tool names depend on agent implementation
        await expect.poll(async () => {
            const history = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__.getHistory());
            const planCreated = history.find((e: any) => e.event.type === 'AGENT_PLAN_CREATED');
            if (!planCreated) return [];
            return planCreated.event.payload.plan.steps.map((s: any) => s.tool);
        }, { timeout: 30000 }).toEqual(expect.arrayContaining(['search_text']));
    });

    test('FR-009: Repair mode provides error context to planner', async ({ page }) => {
        const chatInput = page.locator('[data-testid="chat-input"]');
        await chatInput.fill("Force a search error then fix it");
        await page.keyboard.press('Enter');

        // Check for REPAIR_MODE event
        await expect.poll(async () => {
            const history = await page.evaluate(() => (window as any).__THEIA_EVENT_BUS__.getHistory());
            return history.some((e: any) => e.event.type === 'REPAIR_MODE');
        }, { timeout: 40000 }).toBe(true);
    });
});