# TH-QA-01: Test Strategy & Case Specifications

## 1. TESTING PHILOSOPHY
Theia follows **Verification Driven Development (VDD)**. No requirement exists without a corresponding test, and no feature is considered "Done" until its "Neural Loop" is verified in the CI environment.

---

## 2. TEST LEVELS

| Level | Focus | Tool |
| :--- | :--- | :--- |
| **Unit** | Individual functions (e.g., `sanitizeForVoice`, `colorUtils`). | Vitest |
| **Integration** | Module-to-module communication via EventBus. | Vitest / Playwright |
| **E2E / Functional** | Full user journeys (e.g., "Run tests via voice"). | Playwright |
| **Performance** | Latency benchmarks for lazy loading and TTS. | Playwright + Custom Hooks |

---

## 3. TEST CASE SPECIFICATIONS (TCS)

### TCS-01: Neural Loop Verification (Voice-to-Nav)
*   **Goal:** Verify a spoken command triggers the correct UI navigation.
*   **Scenario:**
    1.  Inject `USER_MESSAGE` { mode: 'voice', text: "Open Agent.ts" }.
    2.  Assert `AGENT_NAVIGATE` is emitted to EventBus.
    3.  Assert UI state `selectedFile` is "src/modules/core/Agent.ts".
    4.  Assert editor line highlight is active.

### TCS-02: Gatekeeper Interception
*   **Goal:** Verify sensitive tools are blocked.
*   **Scenario:**
    1.  Inject `USER_MESSAGE` { text: "Write 'test' to test.txt" }.
    2.  Assert `AGENT_REQUEST_APPROVAL` is emitted.
    3.  Assert `PermissionModal` is visible.
    4.  Reject action -> Assert `write_file` was NOT executed.

### TCS-03: Spec-Driven Grounding
*   **Goal:** Verify Agent cites requirements.
*   **Scenario:**
    1.  Load mock spec with `REQ-AUTH-1: Use MFA`.
    2.  Ask: "Does my code follow the auth spec?"
    3.  Assert response contains "REQ-AUTH-1".

---

## 4. MOCKING STRATEGY

### 4.1 LLM Mocking
For deterministic UI tests, we use `__THEIA_EVENT_BUS__` to bypass Gemini:
*   Instead of waiting for AI, we emit `AGENT_NAVIGATE` directly to test the UI's reaction to the signal.

### 4.2 Git/Linear Mocking
We use Playwright's `route()` to mock API responses from GitHub and Linear, ensuring tests can run offline and without token consumption.

---

## 5. PERFORMANCE TEST PLAN
*   **Metric Capture:** Every automated test run captures `duration` from `AGENT_THINKING` events.
*   **Regression Check:** If any Core Loop execution exceeds 2000ms, the test fails.

---
**Status:** TEST STRATEGY COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-QA-01
