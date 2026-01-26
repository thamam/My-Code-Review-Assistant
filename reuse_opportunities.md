# Reuse Opportunities & Patterns

## 1. Event-Driven Architecture (The Backbone)
*   **Pattern:** `EventBus` (Pub/Sub) + `EventEnvelope`.
*   **Opportunity:** New features should *always* communicate via `EventBus` rather than direct calls.
    *   *Example:* `AtomizerService` should emit `SPEC_ATOMIZED` events rather than just returning data, allowing the `Agent` to reactively ingest new specs.

## 2. Dual-Track Output (The Voice/Screen Split)
*   **Pattern:** `formatDualTrack(voice, screen)` helper in `Agent.ts`.
*   **Opportunity:** This pattern is crucial for "Voice-First" UX. Any new agentic tool or service producing output should use this structured JSON format to ensure the TTS doesn't read code aloud.
    *   *Refactoring:* Move `formatDualTrack` to a shared utility in `src/utils/VoiceUtils.ts` (if not already there) to be used by `DirectorService` as well.

## 3. Runtime/WebContainer Bridge
*   **Pattern:** `AGENT_EXEC_CMD` -> `WebContainerService`.
*   **Opportunity:** The `ToolUtils` formatters (`formatSearchCommand`) are powerful Node.js polyfills.
    *   *Reuse:* Create a library of "Shell Polyfills" (e.g., `find`, `sed`, `awk` equivalents in Node.js one-liners) to enhance the Agent's terminal capabilities without relying on a full Linux userland.

## 4. Spec-Driven Verification (The "Atoms")
*   **Pattern:** `SpecAtom` interface in `docs/specs/phase7-SPEC.md`.
*   **Opportunity:** The "Atomizer" logic (Gemini decomposition) can be reused for:
    *   *PR Descriptions:* Break down PRs into "Change Atoms".
    *   *Bug Reports:* Break down issues into "Reproduction Atoms".

## 5. Tooling Standardization
*   **Pattern:** `FunctionDeclaration` arrays in `Agent.ts` (`plannerTools`, `executorTools`).
*   **Opportunity:** Centralize tool definitions. `DirectorService` and `Agent` likely share tools (`navigate_to_code`). Define these in `src/tools/definitions.ts` to ensure consistency across different "Brains".