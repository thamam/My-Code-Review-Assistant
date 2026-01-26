# Theia: Functional Manifest (Chronological User Journey)

This document maps the functionalities of Theia into a **Chronological Nested User Journey**. It describes how a user interacts with the system from the moment of connection to the final verification of changes, illustrating how technical modules manifest as user capabilities.

> **Legend:**
> - 🟢 **Phase 1: Initialization** (Connection & Context)
> - 🔵 **Phase 2: Exploration** (Navigation & Understanding)
> - 🟣 **Phase 3: Interaction** (Voice & Reasoning)
> - 🟠 **Phase 4: Execution** (Modification & Safety)
> - 🔴 **Phase 5: Verification** (Testing & Self-Correction)

---

## 🟢 Phase 1: Initialization & Context Loading

**Goal:** Establish the "Ground Truth" and load the repository environment.

### Story 1.1: The "Code Oracle" Connection
> *As a Developer starting a session, I want to connect to a repository instantly so that I can ask questions without cloning locally.*

*   **Manifestation:**
    1.  **User Action:** User enters a GitHub URL (`https://github.com/owner/repo`).
    2.  **System Action (Runtime):** `WebContainerService` boots a browser-native Node.js environment.
    3.  **System Action (Navigation):** `NavigationService` fetches the file tree via GitHub API.
    4.  **UI State:** File Tree appears with **"Ghost Nodes"** (dimmed files, not yet loaded).
    5.  **Capability Unlocked:** **Repo Mode** (Read-Only access to the entire codebase).

### Story 1.2: The "Spec Injection"
> *As a Tech Lead, I want Theia to know the active requirements (Linear Ticket or Markdown Spec) so that her answers are grounded in the project goals.*

*   **Manifestation:**
    1.  **User Action:** User pastes a Linear Issue URL or selects a local `specs/feature.md`.
    2.  **System Action (SpecContext):** `AtomizerService` (Gemini) scans the text.
    3.  **System Action (Atomizer):** Decomposes the text into **"Spec Atoms"** (e.g., `REQ-1: Login must be valid`).
    4.  **UI State:** "Active Spec" panel shows the list of requirements.
    5.  **Capability Unlocked:** **Spec-Driven Traceability** (All subsequent answers reference `REQ-ID`).

---

## 🔵 Phase 2: Exploration & Navigation

**Goal:** Build a mental model of the codebase using visual and textual aids.

### Story 2.1: The "Visual Explorer" (Architecture Mapping)
> *As a New Hire, I want to see a high-level map of the system so that I don't get lost in the file tree.*

*   **Manifestation:**
    1.  **User Action:** User asks, *"Show me the authentication flow."*
    2.  **System Action (Agent):** Agent calls `propose_diagrams` tool.
    3.  **System Action (Parser):** Generates Mermaid.js code representing the AuthService and Database interaction.
    4.  **UI State:** An interactive diagram renders in the "Diagrams" tab.
    5.  **Interaction:** User clicks the AuthService node in the diagram.
    6.  **Capability Unlocked:** **Visual Navigation** (Clicking the diagram opens the relevant AuthService source file).

### Story 2.2: The "Deep Diver" (Lazy Loading)
> *As a Reviewer, I want to inspect a file I haven't downloaded yet.*

*   **Manifestation:**
    1.  **User Action:** User clicks a "Ghost Node" (dimmed) utility file in the file tree.
    2.  **System Action (Network):** System fetches *only* that file's content on-demand.
    3.  **Constraint:** **Latency < 2s** (NFR-006).
    4.  **UI State:** Node turns "Hot" (solid color), file opens in editor.
    5.  **Capability Unlocked:** **Hybrid State** (Mixing local changed files with remote repo files).

### Story 2.3: The "Shadow Partner" (Context Awareness)
> *As a Developer, I want Theia to follow my gaze so I don't have to explain what file I'm looking at.*

*   **Manifestation:**
    1.  **User Action:** User switches tabs to the Agent implementation and highlights the processing logic.
    2.  **System Action (LiveContext):** `UserContextMonitor` silently updates the context stream.
    3.  **System Action (Debounce):** Ignores rapid tab switching (<500ms).
    4.  **User Query:** User types *"What does this function do?"* (without naming the function).
    5.  **Capability Unlocked:** **Smart Context Snapshot** (Theia knows "this" means the currently focused code block).

---

## 🟣 Phase 3: Interaction & Reasoning

**Goal:** Collaborate with the Agent to analyze code and plan changes.

### Story 3.1: The "Dual-Track" Conversation
> *As a Voice User, I want the Agent to speak naturally while showing me code snippets, without reading the code aloud.*

*   **Manifestation:**
    1.  **User Action:** User speaks *"Refactor this to use the EventBus."*
    2.  **System Action (Agent):** Generates a **Dual-Track Response**:
        *   **Voice Track:** *"I'll update the function to emit an event instead of calling the service directly."*
        *   **Screen Track:** Code block showing the new `eventBus.emit()` call.
    3.  **System Action (TTS):** `TTSService` plays the Voice Track only.
    4.  **UI State:** Chat panel displays the code snippet.
    5.  **Capability Unlocked:** **Voice-Code Separation** (NFR-008).

### Story 3.2: The "Precision Mode" Analysis
> *As a Senior Engineer, I want a mathematically rigorous answer about code behavior, not a hallucination.*

*   **Manifestation:**
    1.  **User Action:** User asks *"Can this loop ever be infinite?"*
    2.  **System Action (Router):** `Agent` detects complex query -> Routes to **Deep Reasoning** node.
    3.  **System Action (Reasoning):** Gemini 3 Pro analyzes the control flow graph.
    4.  **Output:** *"Yes, if `retryCount` is -1, the condition `i < retryCount` is never met."*
    5.  **Capability Unlocked:** **Static Analysis Proxy**.

---

## 🟠 Phase 4: Execution & Safety

**Goal:** Modify the codebase safely with human supervision.

### Story 4.1: The "Cautious Architect" (Gatekeeping)
> *As a Lead Dev, I want to approve any destructive action before it happens.*

*   **Manifestation:**
    1.  **User Action:** User says *"Delete the old auth controller."*
    2.  **System Action (Planner):** Agent plans to use a terminal command to remove the file.
    3.  **System Action (Gatekeeper):** Detects **SENSITIVE_TOOL**. Intercepts execution.
    4.  **UI State:** **Permission Modal** appears: *"Agent wants to run a delete command on the specified file. Approve?"*
    5.  **User Action:** User clicks "Approve".
    6.  **System Action (Executor):** Command runs.
    7.  **Capability Unlocked:** **Human-in-the-Loop Security** (FR-011).

### Story 4.2: The "Barge-In" (Focus Control)
> *As a User, I want to interrupt the Agent if I see it going down the wrong path, or if I want to type.*

*   **Manifestation:**
    1.  **System Action:** Agent is navigating to different files to search for something.
    2.  **User Action:** User starts typing in the main application component.
    3.  **System Action (Governor):** `UserActivityTracker` detects typing.
    4.  **System Action (Agent):** Emits `AGENT_YIELD`. Stops navigation immediately.
    5.  **Capability Unlocked:** **Focus Locking** (Agent respects user's control).

---

## 🔴 Phase 5: Verification & Self-Correction

**Goal:** Ensure the changes work and fix any errors automatically.

### Story 5.1: The "Resilience Check" (Self-Healing)
> *As a User, I don't want to micromanage syntax errors.*

*   **Manifestation:**
    1.  **System Action:** Agent runs the test suite after a refactor.
    2.  **Result:** Test fails with an import error.
    3.  **System Action (Planner):** Detects non-zero exit code.
    4.  **System Action (Repair Mode):**
        *   Enters **Repair Loop**.
        *   Analyzes error: *"Missing import in target file"*.
        *   New Plan: *"1. Read file. 2. Add import. 3. Re-run test."*
    5.  **Capability Unlocked:** **Autonomous Self-Correction** (FR-004).

---

## Summary of Functional Manifestation

| Phase | Core Functionality | Manifesting Module |
| :--- | :--- | :--- |
| **Init** | Repo Mode, Spec Atoms | `WebContainer`, `AtomizerService` |
| **Explore** | Visual Nav, Lazy Load | `DiagramAgent`, `NavigationService` |
| **Interact** | Dual-Track, Context | `Agent` (Graph), `LiveContext` |
| **Execute** | Gatekeeping, Shell Ops | `TheiaAgent` (Executor), `Runtime` |
| **Verify** | Self-Correction, Testing | `Agent` (Planner), `Runtime` |

_Generated by Theia Mission Control - 2026-01-25_
