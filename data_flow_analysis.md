# Data Flow Analysis

## 1. The Voice/Command Loop (Core)

This flow represents the primary interaction: User speaks/types -> Agent Acts -> System Responds.

1.  **Input:** User says "Run the tests".
2.  **Signal:** UI emits `USER_MESSAGE` event via `EventBus`.
    *   Payload: `{ content: "Run the tests", source: "voice" }`
3.  **Processing (`Agent.ts`):**
    *   `TheiaAgent` receives `USER_MESSAGE`.
    *   **Planner Node:** Calls Gemini with tools.
    *   **Plan Generated:** Gemini returns `submit_plan` with `run_terminal_command("npm test")`.
    *   **Executor Node:**
        *   Checks `SENSITIVE_TOOLS`. `run_terminal_command` is sensitive? Maybe (if not read-only).
        *   If Safe/Approved: Calls `executeTool`.
4.  **Execution (`WebContainerService.ts`):**
    *   `Agent` emits `AGENT_EXEC_CMD`.
    *   `WebContainerService` receives event.
    *   Calls `instance.spawn("npm", ["test"])`.
5.  **Feedback Loop:**
    *   `WebContainerService` streams stdout to `RUNTIME_OUTPUT`.
    *   `Agent` (Executor) waits for `RUNTIME_EXIT`.
6.  **Response:**
    *   `Agent` analyzes exit code.
    *   `Agent` emits `AGENT_SPEAK` with Dual-Track JSON.
        *   Voice: "Tests completed successfully."
        *   Screen: Markdown with test results.
    *   UI/TTS service picks up `AGENT_SPEAK` and renders/speaks.

## 2. The Traceability/Observability Flow

This flow ensures every action is recorded for debugging and "Flight Recording".

1.  **Event Trigger:** Any event (e.g., `AGENT_NAVIGATE`) is emitted to `EventBus`.
2.  **Observation (`TraceService.ts`):**
    *   `TraceService` wildcards (`*`) the event.
    *   **Snapshot:** Asynchronously calls `agent.getState()` to grab the mental state *at that moment*.
3.  **Recording (`FlightRecorder.ts`):**
    *   Creates `TraceEntry` { envelope, state }.
    *   Push to in-memory Ring Buffer.
    *   Persist to `localStorage`.

## 3. The Spec-Driven Context Flow (Phase 7)

This flow (described in architecture docs) injects requirements into the Agent's brain.

1.  **Input:** User loads a Spec (Linear/Markdown).
2.  **Atomization:** `SpecContext` (UI) calls `AtomizerService` (Gemini) -> `SpecAtom[]`.
3.  **Context Injection:**
    *   `UserContextMonitor` (UI) passes `activeSpec` to `Agent`.
    *   `Agent.buildContextEnvelope` includes `[SYSTEM_CONTEXT]`.
4.  **Reasoning:**
    *   Agent prompt includes: "REQ-1: Login must have MFA".
    *   User asks: "Check login".
    *   Agent verifies code against REQ-1.

## 4. The Human-in-the-Loop Approval Flow (Phase 15)

1.  **Trigger:** Agent attempts `write_file("src/critical.ts")`.
2.  **Gatekeeper (`Agent.ts`):**
    *   Detects `SENSITIVE_TOOLS`.
    *   Emits `AGENT_REQUEST_APPROVAL`.
    *   Pauses execution (`pendingAction` state).
3.  **User Interaction:**
    *   UI shows Modal. User clicks "Approve".
    *   UI emits `USER_APPROVAL` { approved: true }.
4.  **Resumption:**
    *   `Agent` receives `USER_APPROVAL`.
    *   Calls `resolvePendingAction(true)`.
    *   Executes the tool.
