# TH-SRS-02: User Stories & Use Case Specifications

## 1. MISSION OBJECTIVE
To define the system's behavior through the lens of user experience, mapping capabilities to specific personas and scenarios.

---

## 2. PERSONAS
| Persona | Role | Primary Goal |
| :--- | :--- | :--- |
| **Senior Sam** | Senior Engineer | Conduct thorough, high-precision code reviews and enforce architectural standards. |
| **Junior Joy** | New Hire | Onboard quickly and understand complex system dependencies without excessive hand-holding. |
| **QA Quentin** | Tester | Verify that implementation perfectly matches the atomic requirements in the PRD. |

---

## 3. USER STORIES

### 3.1 Onboarding & Discovery
*   **Story ID:** US-01 (The Visual Explorer)
*   **Persona:** Junior Joy
*   **Statement:** As a New Hire, I want to see an interactive architecture diagram of the system so that I can jump to the code responsible for specific nodes.
*   **Acceptance Criteria:**
    *   Diagram is generated automatically or on request.
    *   Nodes map to actual file paths.
    *   Clicking a node opens the correct file at the correct line.

### 3.2 Review & Verification
*   **Story ID:** US-02 (The Spec-Driven Reviewer)
*   **Persona:** Senior Sam
*   **Statement:** As a Reviewer, I want Theia to cite specific requirement IDs (e.g., REQ-1) when identifying issues so that I can justify my feedback.
*   **Acceptance Criteria:**
    *   Specs are loaded and atomized correctly.
    *   Agent identifies violations and references the Atom ID.
    *   Voice response mentions the requirement by name.

### 3.3 Safety & Security
*   **Story ID:** US-03 (The Cautious Architect)
*   **Persona:** Senior Sam
*   **Statement:** As a Senior Engineer, I want to approve any file modifications so that I can ensure the AI doesn't break critical code.
*   **Acceptance Criteria:**
    *   Sensitive tools (write_file, terminal) trigger a modal.
    *   Modal shows the exact code change or command.
    *   Agent waits for approval before proceeding.

### 3.4 Resilience
*   **Story ID:** US-04 (The Self-Healing Agent)
*   **Persona:** QA Quentin
*   **Statement:** As a Tester, I want to see the Agent fix its own mistakes when a test fails so that the review process isn't stalled by minor errors.
*   **Acceptance Criteria:**
    *   Command failure triggers "Repair Mode".
    *   Planner analyzes the error output.
    *   A corrected plan is generated and executed successfully.

---

## 4. USE CASE SPECIFICATIONS

### Use Case UC-01: Voice-Driven Code Navigation
*   **Actor:** Developer
*   **Pre-conditions:** System is connected to a repository; Microphone access granted.
*   **Basic Flow:**
    1.  User clicks the microphone icon (or uses hotkey).
    2.  User speaks: *"Show me where the EventBus history is managed."*
    3.  System converts speech to text.
    4.  Agent searches for "EventBus history".
    5.  Agent identifies `src/modules/core/EventBus.ts`.
    6.  System navigates to the file and highlights the `history` property.
    7.  Agent speaks: *"I've navigated to the EventBus class. The history is managed in a ring buffer on line 14."*
*   **Alternative Flow (Ambiguity):**
    1.  Agent finds multiple matches.
    2.  Agent speaks: *"I found two locations. Do you mean the EventBus implementation or the TraceService observer?"*
    3.  User clarifies.
    4.  System proceeds to correct file.

### Use Case UC-02: Spec Atomization and Verification
*   **Actor:** Senior Sam
*   **Pre-conditions:** A Linear ticket or Markdown spec is available.
*   **Basic Flow:**
    1.  User selects a specification source.
    2.  System calls `AtomizerService`.
    3.  Gemini decomposes the spec into atomic requirements (`SpecAtom[]`).
    4.  System displays the "Requirements Checklist".
    5.  User opens a pull request file.
    6.  System automatically checks the file against the active atoms.
    7.  System flags atoms as 'Verified' or 'Violated'.
*   **Post-conditions:** A Traceability Report is generated for the session.

### Use Case UC-03: Autonomous Code Repair
*   **Actor:** Theia (Agent)
*   **Pre-conditions:** Agent is executing a plan (e.g., "Fix the typo in the logger").
*   **Basic Flow:**
    1.  Agent executes `write_file`.
    2.  Agent runs `npm test` to verify.
    3.  Terminal returns `Exit Code: 1` with a syntax error.
    4.  Agent enters `REPAIR_MODE`.
    5.  Planner reads the error: *"Unexpected token at line 42"*.
    6.  Agent creates a new plan: *"1. Read file. 2. Fix token at line 42. 3. Re-test."*
    7.  Agent executes the repair and succeeds.
*   **Post-conditions:** Final success is reported to the user.

---
**Status:** USE CASE DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-SRS-02
