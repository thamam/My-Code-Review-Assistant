# Integration Points & Contracts

## 1. External APIs

### Google Gemini API (AI Studio)
*   **Module:** `src/modules/core/Agent.ts`
*   **Purpose:** The "Brain" (Planning, Reasoning, Tool Selection).
*   **Contract:** `GoogleGenAI` SDK.
*   **Models:** `gemini-3-pro-preview`.
*   **Failure Mode:** `try/catch` block in `Agent.process` -> Emits `AGENT_SPEAK` with error message.

### Google Cloud Text-to-Speech
*   **Module:** `src/modules/voice/TTSService.ts`
*   **Purpose:** High-fidelity voice synthesis.
*   **Contract:** REST API (`https://texttospeech.googleapis.com/v1/text:synthesize`).
*   **Auth:** `VITE_GOOGLE_CLOUD_API_KEY` (or fallback to Gemini key).
*   **Failure Mode:** Fallback to `window.speechSynthesis`.

### WebContainer API (StackBlitz)
*   **Module:** `src/modules/runtime/WebContainerService.ts`
*   **Purpose:** In-browser Node.js execution environment.
*   **Contract:** `@webcontainer/api`.
*   **Key capabilities:** `spawn`, `fs.writeFile`, `fs.readFile`, `mount`.
*   **Constraints:** Requires Cross-Origin Isolation (COOP/COEP headers).

## 2. Internal System Contracts

### The "Nervous System" (EventBus)
*   **Protocol:** `src/modules/core/types.ts`.
*   **Mechanism:** Singleton `EventBus` instance.
*   **Key Events:**
    *   `USER_MESSAGE`: The standard input packet.
    *   `AGENT_SPEAK`: The standard output packet (Dual-Track).
    *   `RUNTIME_OUTPUT`: Streamed stdout/stderr.
    *   `USER_APPROVAL`: Security handshake.

### The "Memory Palace" (Persistence)
*   **Storage:** `localStorage`.
*   **Keys:**
    *   `theia_agent_state`: Serialized `AgentState`.
    *   `theia_flight_log`: Serialized trace history.
*   **Module:** `src/modules/core/Agent.ts` (load/save), `FlightRecorder.ts`.

### The "Bridge" (File Sync)
*   **Mechanism:** `SYSTEM_FILE_SYNC` event.
*   **Producer:** `NavigationService` (UI).
*   **Consumer:** `WebContainerService` (Runtime).
*   **Purpose:** Ensures the Runtime Sandbox has the file the user is looking at in the UI.

## 3. Data Schemas (Phase 7 Specs)

### Universal Spec (`SpecDocument`)
*   **Source:** `docs/specs/phase7-SPEC.md`
*   **Structure:**
    ```typescript
    interface SpecDocument {
      id: string;
      source: 'linear' | 'markdown' | 'manual';
      atoms: SpecAtom[];
    }
    ```

### Atomic Requirement (`SpecAtom`)
*   **Structure:**
    ```typescript
    interface SpecAtom {
      id: string; // "REQ-1"
      description: string;
      status: 'pending' | 'verified' | 'violated';
    }
    ```
