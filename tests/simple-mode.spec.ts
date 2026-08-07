import { test, expect } from '@playwright/test';

/**
 * Simple Mode — E2E smoke test.
 *
 * Covers the manual verification checklist from the design doc (§7):
 * - The engine toggle defaults to Chat (simple mode).
 * - Sending a message produces one growing assistant bubble (not N bubbles).
 * - No approval modal ever appears on the simple-chat path (it never calls tools).
 * - Toggling to Agent mode inserts a local divider message.
 *
 * The Gemini streaming endpoint is mocked via page.route so this test does
 * not depend on a live API key or network access.
 */

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, index: 0 }] })}\n\n`;
}

test.describe('Simple Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Gemini streaming endpoint so the turn resolves deterministically.
    await page.route('**/v1beta/models/**streamGenerateContent**', async (route) => {
      const body = [
        sseChunk('Hello'),
        sseChunk(' world'),
        sseChunk('!'),
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      });
    });

    await page.goto('/');

    const loadSampleButton = page.locator('button:has-text("Load Sample PR")');
    await expect(loadSampleButton).toBeVisible({ timeout: 10000 });
    await loadSampleButton.click();

    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });
  });

  test('defaults to Chat (simple) mode', async ({ page }) => {
    const simpleToggle = page.locator('[data-testid="engine-toggle-simple"]');
    const agentToggle = page.locator('[data-testid="engine-toggle-agent"]');

    await expect(simpleToggle).toBeVisible();
    await expect(agentToggle).toBeVisible();

    // Active segment carries the purple highlight class.
    await expect(simpleToggle).toHaveClass(/bg-purple-600/);
    await expect(agentToggle).not.toHaveClass(/bg-purple-600/);
  });

  test('sending a message produces one growing assistant bubble', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="send-button"]');

    await chatInput.fill('What does this PR do?');
    await sendButton.click();

    // The final cumulative text should appear in exactly one bubble — not
    // once per stream chunk (that would indicate the upsert-by-messageId
    // reducer isn't collapsing partials).
    await expect(page.getByText('Hello world!')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Hello world!')).toHaveCount(1);

    // No permission modal should ever appear on the simple-chat path.
    const permissionModal = page.locator('[data-testid="permission-modal"], .modal-permission, .approval-modal');
    await expect(permissionModal).not.toBeVisible();
  });

  test('toggling to Agent mode inserts a local divider message', async ({ page }) => {
    const agentToggle = page.locator('[data-testid="engine-toggle-agent"]');
    await agentToggle.click();

    await expect(agentToggle).toHaveClass(/bg-purple-600/);
    await expect(page.getByText(/Switched to Agent mode/i)).toBeVisible();
  });

  test('toggling back to Chat mode inserts the Chat-mode divider', async ({ page }) => {
    const agentToggle = page.locator('[data-testid="engine-toggle-agent"]');
    const simpleToggle = page.locator('[data-testid="engine-toggle-simple"]');

    await agentToggle.click();
    await expect(page.getByText(/Switched to Agent mode/i)).toBeVisible();

    await simpleToggle.click();
    await expect(page.getByText(/Switched to Chat mode/i)).toBeVisible();
  });
});
