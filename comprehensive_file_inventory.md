# Comprehensive File Inventory: Documentation, Requirements & Feature Modules

## 1. Documentation & Requirements (`docs/`, `docs/specs/`)

### 1.1 `docs/RETROACTIVE_PRD.md`
*   **Purpose:** Defines the high-level product vision, target audience, core capabilities ("Atoms", Visual Nav, Repo Exploration), NFRs, and success metrics. Preserves the "Soul" of the project.
*   **Key Details:**
    *   **Vision:** Voice-First, Spec-Driven L4 Autonomy.
    *   **Constraints:** Gemini context window (lazy loading required), Browser audio (HTTPS/localhost).
    *   **Metrics:** Traceability (>80%), Voice Utility, Discovery time.

### 1.2 `docs/PRODUCT_BRIEF.md`
*   **Purpose:** High-level description of Theia as a "Spec-Driven Code Review Assistant". Outlines key features (Voice Command, Visual Map, Spec Traceability) and main user stories.
*   **Key Details:**
    *   **Core Flows:** Exploration Loop (Diagram -> Code), Voice Loop (Speech -> Director -> Action).
    *   **Differentiation:** Grounded in specs (Linear, PRDs) unlike generic chat assistants.

### 1.3 `docs/specs/phase7-spec-driven-architecture.md`
*   **Purpose:** Architectural vision for Phase 7 "Universal Spec Compliance". Shifts from Linear-only to source-agnostic "Spec Atoms".
*   **Key Concepts:**
    *   **SpecDocument:** Canonical spec representation.
    *   **SpecAtom:** Smallest testable unit of requirement.
    *   **Hexagonal Architecture:** Adapters (Input) -> Atomizer (Brain/Gemini) -> Conductor (Traceability).
*   **Plan:** Implement `SpecContext`, Adapters, and Traceability UI.

### 1.4 `docs/specs/phase7-SPEC.md`
*   **Purpose:** Detailed technical specification for Phase 7.
*   **Key Definitions:**
    *   **Interfaces:** `SpecDocument`, `SpecAtom`, `SpecAdapter`, `DirectorInput` (updated).
    *   **Algorithm:** AtomizerService using Gemini 3 Pro to decompose markdown into JSON atoms.
    *   **Data Flow:** User -> SpecContext -> Atomizer -> DirectorService -> Voice.
*   **Test Plan:** `tests/spec-traceability.spec.ts`.

### 1.5 `docs/specs/REQUIREMENTS.csv`
*   **Purpose:** Structured list of Functional (FR) and Non-Functional (NFR) requirements.
*   **Fields:** ID, Category, Description, Story, Maturity, Status, Notes.
*   **Key Statuses:** BETA, READY, RELEASED, STABLE.
*   **Usage:** Source of truth for verification.

### 1.6 `docs/specs/USER_STORIES.md`
*   **Purpose:** detailed user stories ("As a... I want to... So that...") linked to FRs/NFRs via a Traceability Matrix.
*   **Stories:**
    *   S1: Visual Explorer (Navigation)
    *   S2: Cautious Architect (Safety/Approvals)
    *   S3: Deep Diver (Lazy Loading)
    *   S4: Resilience Check (Self-Correction)
    *   S5: Shadow Partner (Context Awareness)
    *   S6: Code Oracle (Repo Mode)

---

## 2. Core Module (`src/modules/core/`)

### 2.1 `src/modules/core/Agent.ts`
*   **Purpose:** The central "Brain" of the agent. Implements the `TheiaAgent` class using LangGraph to manage the Planner-Executor loop.
*   **LOC:** ~500
*   **Exports:** `TheiaAgent` (class), `AgentState` (interface), `agent` (singleton instance).
*   **Imports:** `LangGraph`, `GoogleGenAI`, `EventBus`, `Runtime/ToolUtils`, `Search`, `Persistence`.
*   **Key Implementation Details:**
    *   **State Machine:** Planner -> Executor -> Loop/End.
    *   **Tools:** `plannerTools` (submit_plan), `executorTools` (navigate, terminal, write_file, search).
    *   **Dual-Track:** `formatDualTrack` for separating Voice (TTS) and Screen (Markdown) output.
    *   **Safety:** `SENSITIVE_TOOLS` (terminal, write_file) require `USER_APPROVAL` via `pendingAction` state.
    *   **Repair Mode:** Reroutes to Planner with error context if execution fails.
    *   **Persistence:** Saves state to `storageService` (LocalStorage).
*   **Side Effects:** Emits events (`AGENT_SPEAK`, `AGENT_NAVIGATE`, etc.), calls Gemini API.

### 2.2 `src/modules/core/EventBus.ts`
*   **Purpose:** The "Nervous System". Implements a Pub/Sub event dispatcher with a ring buffer for history.
*   **LOC:** ~150
*   **Exports:** `EventBus` (class), `eventBus` (singleton).
*   **Key Implementation Details:**
    *   **Wildcards:** Supports `*` subscription.
    *   **History:** Keeps last 100 `EventEnvelope`s in memory ("Black Box").
    *   **Error Handling:** Catches handler errors to prevent crash.

### 2.3 `src/modules/core/types.ts`
*   **Purpose:** Defines the Protocol (Events) for the system.
*   **LOC:** ~200
*   **Exports:** `TheiaEvent` (union), `UserIntent` (signals), `AgentAction` (outputs), `SystemEvent`.
*   **Key Definitions:**
    *   `USER_MESSAGE`, `VOICE_INPUT`, `UI_INTERACTION`.
    *   `AGENT_SPEAK`, `AGENT_NAVIGATE`, `AGENT_THINKING`, `AGENT_REQUEST_APPROVAL`.
    *   `RUNTIME_OUTPUT`, `SYSTEM_FILE_SYNC`.
    *   `TraceEntry`, `FlightRecorder`.

### 2.4 `src/modules/core/graph.ts`
*   **Purpose:** Alternative/Orchestrator StateGraph definition. *Note: Seems less active than `Agent.ts`, potentially for the "Agentic Orchestrator" specific architecture.*
*   **LOC:** ~250
*   **Exports:** `agentGraph`, `AgentState`.
*   **Key Implementation Details:**
    *   Nodes: `intentClassification`, `contextSelection`, `precisionRouter`, `deepReasoning`, `toolExecution`.
    *   Uses `navigationService` directly.

### 2.5 `src/modules/core/TraceService.ts`
*   **Purpose:** The "Black Box" Observer. Connects `EventBus` to `FlightRecorder`.
*   **LOC:** ~50
*   **Exports:** `TraceService`.
*   **Key Implementation Details:**
    *   Subscribes to `*`.
    *   Snapshots `agent.getState()` asynchronously (`setTimeout`) to avoid blocking.

### 2.6 `src/modules/core/FlightRecorder.ts`
*   **Purpose:** In-memory persistence for traces.
*   **LOC:** ~50
*   **Exports:** `LocalFlightRecorder`.
*   **Key Implementation Details:**
    *   Ring buffer (500 entries).
    *   Persists to `localStorage` ('theia_flight_log').

### 2.7 `src/modules/core/ContextSnapshot.ts`
*   **Purpose:** Helper to format conversation history for LLM context.
*   **LOC:** ~20
*   **Exports:** `buildContextSnapshot`.

---

## 3. Voice Module (`src/modules/voice/`)

### 3.1 `src/modules/voice/TTSService.ts`
*   **Purpose:** High-quality Text-to-Speech using Google Cloud TTS.
*   **LOC:** ~130
*   **Exports:** `speakWithCloudTTS`, `synthesizeSpeech`.
*   **Imports:** `VITE_GOOGLE_CLOUD_API_KEY` (or fallback to Gemini key).
*   **Key Implementation Details:**
    *   **Dual Strategy:** Tries Cloud TTS (REST API) -> Falls back to `window.speechSynthesis` (Browser).
    *   **Audio:** Decodes Base64 MP3 and plays via `AudioContext`.
    *   **Config:** Supports 'en-US' and 'he-IL'.

---

## 4. Runtime Module (`src/modules/runtime/`)

### 4.1 `src/modules/runtime/WebContainerService.ts`
*   **Purpose:** The "Legs". Manages the `WebContainer` (browser-based Node.js environment).
*   **LOC:** ~150
*   **Exports:** `WebContainerService`, `runtime` (singleton).
*   **Imports:** `@webcontainer/api`, `EventBus`.
*   **Key Implementation Details:**
    *   **Boot:** `WebContainer.boot()`.
    *   **Execution:** `spawn` process, pipes output to `RUNTIME_OUTPUT` events.
    *   **File Sync:** Listens for `SYSTEM_FILE_SYNC` to mount files into container.

### 4.2 `src/modules/runtime/ToolUtils.ts`
*   **Purpose:** Command formatting helpers.
*   **LOC:** ~30
*   **Exports:** `formatSearchCommand`, `formatWriteFileCommand`.
*   **Key Implementation Details:**
    *   **Node.js Polyfills:** Generates one-liner Node.js scripts to emulate `grep` (search) and `mkdir -p && writeFile` because WebContainer shell environment is minimal.
    *   **Base64:** Uses Base64 encoding for arguments to avoid shell escaping hell.

### 4.3 `src/modules/runtime/types.ts`
*   **Purpose:** Runtime-specific types.
*   **LOC:** ~60
*   **Exports:** `RuntimeConfig`, `RuntimeState`, `CommandRequest`, `CommandResult`.

