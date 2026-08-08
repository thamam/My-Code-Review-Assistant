import { test, expect } from '@playwright/test';

test('Verify Context Blindness Fix: sendMessage should capture selected file', async ({ page }) => {
    // 1. Go to the app
    await page.goto('/');

    // 2. Wait for PR data to load (Click 'Load Sample PR' to verify with mock data)
    const samplePrBtn = page.locator('text=Load Sample PR');
    // It might take a moment for the welcome screen to appear/hydrate
    await samplePrBtn.waitFor({ state: 'visible', timeout: 10000 });
    await samplePrBtn.click();

    await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeVisible({ timeout: 10000 });

    // 3. Select a file from the tree (e.g., FileNode.tsx or any visible file)
    // We'll click the first file node we find to ensure selection state is active
    const firstFile = page.locator('[role="treeitem"]').locator('svg.lucide-file-code, svg.lucide-file').first();
    await firstFile.click();

    // Wait for selection to stick (visual indication)
    await expect(page.locator('.bg-blue-900\\/50')).toBeVisible();

    // 4. Inject a spy on the EventBus to capture the next USER_MESSAGE
    await page.evaluate(() => {
        (window as any)._capturedEvents = [];
        (window as any).__THEIA_EVENT_BUS__.subscribe('USER_MESSAGE', (envelope: any) => {
            (window as any)._capturedEvents.push(envelope);
        });
    });

    // 5. Simulate sending a message (via UI or calling sendMessage directly if exposed, but UI is better)
    const chatInput = page.locator('textarea[placeholder*="Ask Theia"]');
    // Note: Placeholder might vary, adjusting selector if needed
    await page.keyboard.press('Control+`'); // Toggle chat if needed, but it's usually open

    // Actually, we can just use the Chat Input
    await page.locator('button[title="Chat"]').click(); // Ensure chat is open

    await page.fill('textarea', 'What is this file?');
    await page.press('textarea', 'Enter');

    // 6. Verify the captured event has the correct context
    await expect.poll(async () => {
        return await page.evaluate(() => {
            const events = (window as any)._capturedEvents;
            if (events.length === 0) return null;
            return events[events.length - 1].event.payload.context.activeFile;
        });
    }).not.toBeNull();
});
