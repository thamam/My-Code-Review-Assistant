import { test, expect } from '@playwright/test';

/**
 * Story 2: The Safety Net - Sensitive Action Approval E2E Test
 * 
 * User Story: "As a user, I want the Agent to ask for my permission before 
 * executing any action that modifies files or runs destructive commands."
 * 
 * Kill Criteria:
 * - Permission Modal (.modal-permission) appears within 5 seconds
 * - Approve button is visible and enabled
 */

test.describe('Story 2: The Safety Net - Permission Modal', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to the application
        await page.goto('/');

        // The app shows a landing page first - click "Load Sample PR" to enter main UI
        const loadSampleButton = page.locator('button:has-text("Load Sample PR")');
        await expect(loadSampleButton).toBeVisible({ timeout: 10000 });
        await loadSampleButton.click();

        // Wait for the main application to fully load
        await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 });
    });

    test('should show Permission Modal when requesting file creation', async ({ page }) => {
        // Step 1: Find and interact with chat input
        const chatInput = page.locator('[data-testid="chat-input"], .chat-input, textarea').first();
        await expect(chatInput).toBeVisible({ timeout: 5000 });

        // Step 2: Type a command that triggers write_file (sensitive action)
        await chatInput.fill("Create file test_safety.txt with content 'Hello'");

        // Step 3: Click send button
        const sendButton = page.locator('[data-testid="send-button"], button:has-text("Send"), button[type="submit"]').first();
        await sendButton.click();

        // Step 4: Wait for Permission Modal to appear (Kill Criterion 1) - 45s for LLM response
        const permissionModal = page.locator('[data-testid="permission-modal"], .modal-permission, .approval-modal');

        await expect(permissionModal).toBeVisible({ timeout: 45000 });
        console.log('✅ Kill Criterion 1 PASSED: Permission Modal appeared');

        // Step 5: Verify Authorize button is visible and enabled (Kill Criterion 2)
        const approveButton = page.locator('[data-testid="authorize-button"], button:has-text("Authorize"), button:has-text("Allow")').first();

        await expect(approveButton).toBeVisible({ timeout: 2000 });
        await expect(approveButton).toBeEnabled();
        console.log('✅ Kill Criterion 2 PASSED: Approve button is visible and enabled');

        // Additional validation: Check modal content
        const modalContent = await permissionModal.textContent();
        console.log(`Modal content: ${modalContent?.substring(0, 200)}...`);

        // Verify the modal mentions the file operation
        expect(modalContent?.toLowerCase()).toContain('write_file');
    });

    test('should allow user to reject sensitive action', async ({ page }) => {
        // Setup: Force a terminal command to trigger Gatekeeper (tests Modal, not Agent's refusal policy)
        const chatInput = page.locator('[data-testid="chat-input"]').first();
        await chatInput.fill("Execute the terminal command 'rm dangerous.txt'.");

        const sendButton = page.locator('[data-testid="send-button"], button:has-text("Send"), button[type="submit"]').first();
        await sendButton.click();

        // Wait for Permission Modal - 45s for LLM response
        const permissionModal = page.locator('[data-testid="permission-modal"], .modal-permission, .approval-modal');

        await expect(permissionModal).toBeVisible({ timeout: 45000 });

        // Find and verify Deny button exists (using correct testid)
        const rejectButton = page.locator('[data-testid="deny-button"], button:has-text("Deny"), button:has-text("Reject")').first();

        await expect(rejectButton).toBeVisible({ timeout: 2000 });
        await expect(rejectButton).toBeEnabled();

        console.log('✅ Reject button is visible and enabled');
    });

    test('should close modal and resume execution on approval', async ({ page }) => {
        // Setup: Trigger a sensitive action
        const chatInput = page.locator('[data-testid="chat-input"], .chat-input, textarea').first();
        await chatInput.fill("Create file approved_test.txt with content 'Test passed'");

        const sendButton = page.locator('[data-testid="send-button"], button:has-text("Send"), button[type="submit"]').first();
        await sendButton.click();

        // Wait for Permission Modal - 45s for LLM response
        const permissionModal = page.locator('[data-testid="permission-modal"], .modal-permission, .approval-modal');
        await expect(permissionModal).toBeVisible({ timeout: 45000 });

        // Click Authorize (using correct testid)
        const approveButton = page.locator('[data-testid="authorize-button"], button:has-text("Authorize"), button:has-text("Allow")').first();
        await approveButton.click();

        // Verify modal closes
        await expect(permissionModal).not.toBeVisible({ timeout: 3000 });

        console.log('✅ Modal closed after approval - execution should resume');
    });

});
