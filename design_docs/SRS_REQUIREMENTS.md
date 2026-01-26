# TH-SRS-01: Software Requirements Specification (SRS)

## 1. INTRODUCTION

### 1.1 Purpose
The purpose of this document is to provide a comprehensive description of the **Theia** system. It will explain the system's purpose, scope, functional requirements, and non-functional requirements.

### 1.2 System Scope
Theia is an AI-powered code review assistant that bridges the gap between requirements and implementation. It provides a voice-first, interactive interface for exploring, modifying, and verifying codebases using a "Spec-Driven" approach.

### 1.3 Definitions, Acronyms, and Abbreviations
| Term | Definition |
| :--- | :--- |
| **Agent** | The AI-driven control plane managing the reasoning loop. |
| **Atoms** | Granular, testable units of requirements (SpecAtoms). |
| **Dual-Track** | A protocol separating voice output (for TTS) from screen output (for UI). |
| **Ghost Node** | A file in the tree that exists in the remote repo but hasn't been loaded locally yet. |
| **Hot Node** | A file that has been modified or loaded into the active session. |
| **Linear** | An external issue tracking system used as a source for specs. |
| **WebContainer** | A browser-native Node.js runtime for executing code. |

---

## 2. GENERAL DESCRIPTION

### 2.1 Product Perspective
Theia is a local-first web application that utilizes cloud-based LLMs (Gemini) and TTS services. It operates directly on the user's browser, ensuring code privacy while leveraging high-performance AI.

### 2.2 User Classes and Characteristics
*   **Senior Developers:** Primary users who perform reviews and architectural analysis.
*   **New Hires:** Use the system for onboarding and visual exploration.
*   **QA Engineers:** Use the system for automated verification against specs.

### 2.3 Operating Environment
*   **Platform:** Modern Web Browsers (Chrome, Edge, Safari).
*   **Prerequisites:** High-speed internet for API calls, Cross-Origin Isolation support.

### 2.4 Design and Implementation Constraints
*   **Gemini Context Window:** Requires intelligent context selection (Lazy Loading).
*   **Browser Security:** File system access and microphone usage require user permission and secure context (HTTPS/Localhost).

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Agent & Reasoning
*   **FR-004:** Self-Correction: Failure triggers re-planning.
*   **FR-005:** Router Logic: Loop back to Executor on partial success.
*   **FR-009:** Repair Mode: Planner receives error context for recovery.
*   **FR-007:** Agent can search the codebase using semantic and text search.
*   **FR-010:** Agent can read file contents from the sandbox.

### 3.2 Gatekeeping & Safety
*   **FR-011:** Gatekeeper intercepts sensitive tools (e.g., `write_file`, `terminal_command`).
*   **FR-012:** User can approve or reject actions via a UI modal.
*   **FR-026:** Permission Modal renders with tool arguments and rationale.

### 3.3 Navigation & Visualization
*   **FR-018:** Navigate to specific file and line number in the code viewer.
*   **FR-029:** Generate diagrams from code using Mermaid syntax.
*   **FR-030:** UI renders interactive diagrams with clickable nodes.
*   **FR-031:** Clicking a diagram node triggers navigation to the source code.
*   **FR-032:** Hybrid File Tree showing "Hot" and "Ghost" files.
*   **FR-035:** Clicking a Ghost Node triggers lazy loading from the Git provider.

### 3.4 Voice & Interaction
*   **FR-038:** Dual-Track Protocol: Agent outputs structured JSON {voice, screen}.
*   **FR-027:** Voice Synthesis: Integration with Web Speech API and Cloud TTS.
*   **FR-041:** Barge-In Handling: Agent yields control when user becomes active.
*   **FR-042:** Focus Locking: Navigation is skipped if user is actively typing.

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Security & Privacy
*   **NFR-003:** No destructive action (file write/delete) without explicit user consent.
*   **NFR-Privacy:** User code remains in the browser sandbox; only relevant snippets are sent to LLM APIs.

### 4.2 Performance
*   **NFR-006:** Lazy load latency for files must be < 2 seconds.
*   **NFR-007:** Ghost file caching to avoid redundant network requests.
*   **NFR-Latency:** Voice turnaround time (Turn-Taking) should be < 2 seconds.

### 4.3 Reliability
*   **NFR-FaultTolerance:** System must recover gracefully from API timeouts or network failures using the "Repair Mode".

### 4.4 Usability
*   **NFR-Accessibility:** High-fidelity voice output (Cloud TTS) to ensure clarity.
*   **NFR-Sanitization:** (NFR-008) Voice track must be sanitized of markdown and code syntax for a natural reading experience.

---

## 5. SYSTEM CONTEXT & INTERFACES

### 5.1 External Interfaces
*   **GitHub API:** For fetching PR diffs and repository file trees.
*   **Linear API:** For ingesting requirement documents.
*   **Google Gemini API:** Primary reasoning engine.
*   **Google Cloud TTS:** Primary voice synthesis engine.

### 5.2 Internal Interfaces
*   **EventBus:** The core message passing interface using `TheiaEvent` protocols.
*   **WebContainer API:** The interface for the browser-based runtime sandbox.

---
**Status:** SRS DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-SRS-01
