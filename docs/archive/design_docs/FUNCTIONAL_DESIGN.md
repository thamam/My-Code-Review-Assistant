# TH-FDD-01: Functional Design Document (Logic & State)

## 1. THE COGNITIVE ENGINE (LangGraph)
Theia's intelligence is modeled as a cyclic state machine. This allows the system to deliberate, act, and recover from failure.

### 1.1 State Graph Transitions
The graph consists of nodes (logic blocks) and conditional edges (decision logic).

| Node | Responsibility | Exit Logic |
| :--- | :--- | :--- |
| **Planner** | Generates a step-by-step `AgentPlan`. | Moves to **Executor**. |
| **Executor** | Executes a single step from the plan. | **Success:** Loops back to Executor (next step) or ends. |
| **Executor** | *Failed Execution* | Moves to **Planner** (Repair Mode). |
| **Executor** | *Sensitive Tool* | Transitions to **Hanging State** (Awaiting Approval). |

### 1.2 State Schema (`AgentState`)
```typescript
interface AgentState {
  messages: { role: string; content: string }[];
  context: UIContext;   // The "Ground Truth" from UI
  prData: PRMetadata;   // Context from Git
  plan?: AgentPlan;     // The sequence of steps
  lastError?: string;   // Capture for Repair Mode
  pendingAction?: {     // The "Held" action for Gatekeeper
    tool: string;
    args: any;
    rationale: string;
  };
}
```

---

## 2. DATA MODELS (ERDs)

### 2.1 The Atomic Requirement (`SpecAtom`)
The foundation of traceability.
```typescript
interface SpecAtom {
  id: string;          // e.g., "REQ-1"
  category: 'logic' | 'ui' | 'schema' | 'security';
  description: string; // Atomic assertion
  context: string[];   // Associated file paths
  status: 'pending' | 'verified' | 'violated';
}
```

### 2.2 The Event Envelope (Nervous System)
The contract for all internal communication.
```typescript
interface EventEnvelope {
  id: string;          // Unique UUID
  timestamp: number;
  source: 'ui' | 'agent' | 'system';
  event: TheiaEvent;   // Union of all input/output signals
}
```

---

## 3. CORE ALGORITHMS

### 3.1 The Atomizer Algorithm
*   **Input:** Raw Markdown/Text specification.
*   **Model:** Gemini 3 Pro (JSON Mode).
*   **Logic:**
    1.  Parse document structure.
    2.  Extract testable assertions.
    3.  Ignore boilerplate/meta-text.
    4.  Assign sequential IDs.
    5.  Categorize by domain (UI, Logic, etc.).
*   **Output:** `SpecAtom[]`.

### 3.2 The Repair Mode (Self-Correction)
*   **Trigger:** Tool returns non-zero exit code or timeout.
*   **Logic:**
    1.  Capture stdout/stderr from the failed command.
    2.  Inject error into Planner's system prompt.
    3.  Force "Diagnostic First" strategy (e.g., `ls` before `cat`).
    4.  Generate new plan to achieve original goal.

### 3.3 Dual-Track Response Synthesis
*   **Purpose:** Voice-First UI without reading code.
*   **Logic:**
    1.  Take raw text response from Gemini.
    2.  **Voice Track:** Strip markdown, code blocks, and complex punctuation. Limit to ~2 sentences.
    3.  **Screen Track:** Retain full formatting, Mermaid diagrams, and code snippets.
    4.  **Format:** Return as JSON `{ voice, screen }`.

---

## 4. TOOL SPECIFICATIONS

### 4.1 Surface & Deep Search
*   **find_file:** In-memory name match (MiniSearch).
*   **search_text:** Node.js recursive grep script executed in WebContainer.

### 4.2 File Management
*   **write_file:** Base64 encoded transfer to prevent shell syntax issues.
*   **mount_file:** Automatic parent directory creation (`mkdir -p`) before writing.

---

## 5. RE-IMPLEMENTATION NOTES
*   **Concurrency:** Use `setTimeout(..., 0)` in `TraceService` to prevent observability from blocking the main loop.
*   **Timeout:** Apply a 15s-30s timeout to all shell executions to prevent "Ghost" processes from hanging the Agent.

---
**Status:** FUNCTIONAL DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-FDD-01
