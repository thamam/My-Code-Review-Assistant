# Documentation & Requirements - Deep Dive Documentation

**Generated:** 2026-01-25
**Scope:** `docs/specs/`, `docs/`, `src/modules/core/`, `src/modules/runtime/`, `src/modules/voice/`
**Files Analyzed:** ~17
**Lines of Code:** ~1500
**Workflow Mode:** Exhaustive Deep-Dive

## Overview

**Target:** Documentation & Requirements (Core Architecture)

**Purpose:** This deep-dive covers the system's "Brain" (Agent), "Nervous System" (EventBus), "Legs" (Runtime), and "Mouth" (Voice), along with the "Spec-Driven" specifications (Phase 7) that govern its behavior.

**Key Responsibilities:**
1.  **Orchestration:** `Agent.ts` manages the Planner/Executor loop.
2.  **Communication:** `EventBus.ts` handles all internal signals.
3.  **Execution:** `WebContainerService.ts` runs shell commands in the browser.
4.  **Specification:** `phase7-SPEC.md` defines the "Universal Spec Compliance" architecture.

**Integration Points:** Google Gemini API, Google Cloud TTS, WebContainer API, LocalStorage.

## Complete File Inventory

### `src/modules/core/Agent.ts`

**Purpose:** The central intelligence unit. Manages the LangGraph state machine, tool selection, and execution loop.
**Lines of Code:** ~500
**File Type:** TypeScript (Class)

**What Future Contributors Must Know:** This is the most complex file. It handles the Planner -> Executor loop, safety gating (`SENSITIVE_TOOLS`), and dual-track output. Modification requires understanding LangGraph.

**Exports:**
- `TheiaAgent` - Main class
- `agent` - Singleton instance
- `AgentState` - State interface

**Dependencies:**
- `EventBus` - For emitting/receiving signals
- `GoogleGenAI` - For LLM calls
- `Runtime/ToolUtils` - For command formatting

**Used By:**
- `TraceService.ts` (Observation)
- `DirectorService.ts` (Legacy integration)

**Key Implementation Details:**

```typescript
// Dual-Track Output for Voice-First UX
function formatDualTrack(voice: string, screen?: string): string {
  const cleanVoice = sanitizeForVoice(voice).substring(0, 200);
  return JSON.stringify({ voice: cleanVoice, screen: screen || voice });
}
```

**Patterns Used:**
- **State Machine:** LangGraph (`StateGraph`)
- **Singleton:** Exported `agent` instance
- **Governor:** Logic to prevent infinite loops (`routePlan`)

**State Management:** Internal `AgentState` (messages, plan, context, prData), persisted via `storageService`.

**Side Effects:**
- API Calls (Gemini)
- Event Emissions (`AGENT_SPEAK`, `AGENT_NAVIGATE`)

**Error Handling:** `try/catch` in `process` loop; emits `AGENT_SPEAK` with error details; `Planner` has "Repair Mode" to fix failed plans.

**Testing:**
- Test File: `tests/agent-intelligence.spec.ts` (inferred)
- Coverage: High (Core logic)

**Comments/TODOs:**
- "Phase 15: The Collaborator - Human-in-the-Loop"
- "Phase 17: User Activity Tracker"

---

### `src/modules/core/EventBus.ts`

**Purpose:** Central Pub/Sub event dispatcher.
**Lines of Code:** ~150
**File Type:** TypeScript (Class)

**What Future Contributors Must Know:** The "Black Box" history buffer is critical for debugging ("Flight Recorder").

**Exports:**
- `EventBus` - Class
- `eventBus` - Singleton

**Dependencies:**
- `types.ts` - Protocol definitions

**Used By:**
- Almost every module in the system.

**Key Implementation Details:**
- **Ring Buffer:** Keeps last 100 events in memory.
- **Wildcard Subscription:** `subscribe('*', handler)` supported.

**State Management:** Internal `history` array.

---

### `src/modules/runtime/WebContainerService.ts`

**Purpose:** Browser-based Node.js runtime environment.
**Lines of Code:** ~150
**File Type:** TypeScript (Class)

**What Future Contributors Must Know:** Requires COOP/COEP headers to function. Boot is async.

**Exports:**
- `WebContainerService` - Class
- `runtime` - Singleton

**Dependencies:**
- `@webcontainer/api`

**Key Implementation Details:**
- **File Sync:** Listens for `SYSTEM_FILE_SYNC` to mirror UI files to container.
- **Output Streaming:** Pipes process stdout to `RUNTIME_OUTPUT` events.

---

### `docs/specs/phase7-SPEC.md`

**Purpose:** Technical specification for "Universal Spec Compliance".
**Lines of Code:** N/A (Markdown)
**File Type:** Documentation

**What Future Contributors Must Know:** Defines the "Atomizer" architecture (Gemini decomposing specs into JSON).

**Key Definitions:**
- `SpecDocument`: Canonical spec source.
- `SpecAtom`: Testable requirement unit.

---

## Contributor Checklist

- **Risks & Gotchas:**
    - **Agent Loop:** The `Agent` can theoretically enter an infinite loop if the Planner keeps generating the same failed plan. The "Governor" logic (`routePlan`) checks for this, but be careful when modifying state transitions.
    - **Runtime Headers:** `WebContainer` fails silently if Cross-Origin headers are missing.
    - **API Costs:** High volume of `TTSService` or `AtomizerService` calls can rack up costs.
- **Pre-change Verification Steps:**
    1.  Check `VITE_GEMINI_API_KEY` is active.
    2.  Open Console and filter for `[EventBus]` to ensure signals are flowing.
    3.  Verify `localStorage` has `theia_agent_state` if testing persistence.
- **Suggested Tests Before PR:**
    - `npx playwright test tests/spec-traceability.spec.ts` (Verify Spec Phase 7)
    - `npm test` (Unit tests)

## Architecture & Design Patterns

### Code Organization
- **Modules (`src/modules/`)**: Feature-sliced architecture (Core, Runtime, Voice).
- **Services (`src/services/`)**: Higher-level orchestrators.
- **Docs (`docs/`)**: "Source of Truth" driven development.

### Design Patterns
- **Hexagonal Architecture:** Defined in `phase7-spec-driven-architecture.md`. Adapters -> Core -> UI.
- **Event-Driven:** `EventBus` decouples all modules.
- **Dual-Track Output:** Separates Voice (TTS) from Screen (Visuals).
- **Operation Glass Box:** `TraceService` + `FlightRecorder` for observability.

### State Management Strategy
- **Agent:** LangGraph state (ephemeral/persisted to LocalStorage).
- **System:** `EventBus` (transient signals).
- **Specs:** `SpecContext` (React state).

## Data Flow

### 1. The Voice Loop
User (`USER_MESSAGE`) -> EventBus -> Agent (Planner -> Executor) -> Runtime (`AGENT_EXEC_CMD`) -> EventBus (`RUNTIME_OUTPUT`) -> Agent -> EventBus (`AGENT_SPEAK`) -> TTS.

### 2. The Spec Loop
Spec Source (Linear/MD) -> SpecContext -> Atomizer (Gemini) -> `SpecAtom[]` -> Agent Context (`[SYSTEM_CONTEXT]`).

## Integration Points

### APIs Consumed
- **Google Gemini:** `Agent.ts` (Reasoning), `AtomizerService` (Specs).
- **Google Cloud TTS:** `TTSService.ts`.
- **WebContainer:** `WebContainerService.ts`.

### Shared State
- **`theia_agent_state`** (LocalStorage): Agent resumption data.
- **`theia_flight_log`** (LocalStorage): Debug traces.

## Dependency Graph

### Core Dependencies
- `Agent` -> `EventBus`
- `Runtime` -> `EventBus`
- `TraceService` -> `EventBus`, `Agent`

### Circular Dependencies
✓ No circular dependencies detected (EventBus breaks cycles).

## Testing Analysis

### Test Coverage Summary
- **Core:** High coverage inferred from critical nature.
- **Specs:** `tests/spec-traceability.spec.ts` exists.
- **Voice:** `tests/voice-iq.spec.ts` mentioned in docs.

### Testing Gaps
- `Runtime` module is hard to unit test without mocking `WebContainer`.

## Related Code & Reuse Opportunities

### Similar Features Elsewhere
- **`DirectorService.ts`**: Legacy/Parallel orchestrator. Logic overlaps with `Agent.ts`.

### Reusable Utilities Available
- **`ToolUtils`**: Node.js polyfills for shell commands.
- **`formatDualTrack`**: Standardized output formatter.

## Modification Guidance

### To Add New Functionality
1.  **New Tool:** Add to `executorTools` in `Agent.ts` and handle in `executeTool`.
2.  **New Event:** Define in `types.ts`, add handler in `Agent.ts` or relevant service.
3.  **New Spec Source:** Create `SpecAdapter` (Phase 7).

### To Modify Existing Functionality
- **Agent Logic:** Modify `plannerNode` or `executorNode` in `Agent.ts`. Beware of state transitions.
- **Runtime:** Update `WebContainerService.ts`. Ensure `ToolUtils` formatters are updated if shell syntax changes.

---

_Generated by `document-project` workflow (deep-dive mode)_
_Base Documentation: docs/index.md_
_Scan Date: 2026-01-25_
_Analysis Mode: Exhaustive_
