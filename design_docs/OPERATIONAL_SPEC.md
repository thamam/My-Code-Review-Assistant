# TH-OPS-01: Operational Specification (Security & Error Handling)

## 1. SECURITY THREAT MODEL

### 1.1 Data Privacy (Code Exfiltration)
*   **Threat:** Sensitive proprietary code is sent to third-party LLMs.
*   **Mitigation:** 
    *   Theia operates as a **Local-First** app. No code is stored on Theia servers (there are none).
    *   **Snippet-Only context:** Only the active file or relevant snippets are sent to Gemini.
    *   **User Gating:** Users can see exactly what context is being sent in the Traceability panel.

### 1.2 Sandbox Escape (Malicious Execution)
*   **Threat:** The Agent executes a command that harms the host machine.
*   **Mitigation:**
    *   **WebContainer Sandbox:** All execution happens in a browser-native WASM environment, isolated from the user's local filesystem and OS.
    *   **Network Isolation:** WebContainers have limited network access (no raw sockets).
    *   **Human-in-the-Loop:** Sensitive commands (`rm`, `write_file`) are intercepted by the **Gatekeeper** and require explicit user approval.

### 1.3 Secret Management
*   **Threat:** API Keys (Gemini, Linear) are exposed in logs or commits.
*   **Mitigation:**
    *   Keys are stored in `.env` files and never committed.
    *   **Sanitization:** The `FlightRecorder` and `EventBus` logs must be checked to ensure API keys are not accidentally recorded in payload data.

---

## 2. ERROR HANDLING PROCEDURES

### 2.1 Error Classification
| Category | Example | Strategy |
| :--- | :--- | :--- |
| **Transient** | Gemini API 503, Network Timeout | **Retry:** Automatic retry with exponential backoff. |
| **Cognitive** | Agent fails to find a file, Hallucination | **Repair:** Trigger "Repair Mode" to re-plan with more context. |
| **Security** | User rejects action, Sandbox permission | **Halt:** Stop execution and notify user with rationale. |
| **System** | WebContainer boot failure, Out of Memory | **Reset:** Prompt user to reload the session/sandbox. |

### 2.2 Error Code Definitions
| Code | Meaning | User Message |
| :--- | :--- | :--- |
| **ERR_BOOT_01** | WebContainer boot timeout | "The execution sandbox failed to start. Please reload." |
| **ERR_LLM_01** | Gemini API Quota Exceeded | "AI limit reached. Please wait a moment." |
| **ERR_NAV_01** | File not found in Repo | "I couldn't find that file in the repository." |
| **ERR_GATE_01** | Sensitive tool rejection | "Action canceled. Standing by for next command." |

---

## 3. LOGGING & OBSERVABILITY STANDARDS

### 3.1 Event Logging (EventBus)
*   All internal signals must be logged to the in-memory **Ring Buffer**.
*   Log Format: `{ timestamp, source, type, payload_summary }`.
*   Payloads containing large code blocks should be truncated in the summary view.

### 3.2 The Flight Recorder (Traceability)
*   **Snapshotting:** For every `AGENT_ACTION`, a full snapshot of the `AgentState` must be captured.
*   **Persistence:** The last 100 entries should be persisted to `LocalStorage` to allow post-mortem analysis after a crash or reload.

### 3.3 Diagnostic Mode
*   Users can activate "Operation Glass Box" to see real-time tool calls and raw LLM prompts in a dedicated debug sidebar.

---
**Status:** OPERATIONAL DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-OPS-01
