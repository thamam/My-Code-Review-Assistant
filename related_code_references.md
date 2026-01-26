# Related Code References

## 1. Orchestration & Services
*   **`src/services/DirectorService.ts`**: The predecessor/parallel orchestrator to `src/modules/core/Agent.ts`.
    *   *Relationship:* `Agent.ts` seems to be the "Agentic" evolution (`Phase 15`), while `DirectorService` handles the "Legacy" or "Director-Actor" flow described in `PRODUCT_BRIEF.md`.
    *   *Pattern:* Both manage LLM interactions, but `Agent.ts` uses a State Graph (LangGraph) while `DirectorService` likely uses a linear prompt-response model.

*   **`src/services/VoiceService.ts`**: High-level voice manager.
    *   *Relationship:* Consumes `src/modules/voice/TTSService.ts` and likely integrates with `src/modules/core/EventBus.ts` to handle `VOICE_INPUT` and trigger `AGENT_SPEAK`.

*   **`src/services/AtomizerService.ts`**: The "Brain" for Phase 7 specs.
    *   *Relationship:* Referenced in `docs/specs/phase7-SPEC.md`. Decomposes requirements for `SpecContext`.

## 2. State Management (Contexts)
*   **`contexts/LiveContext.tsx`**: The React-side bridge.
    *   *Relationship:* Likely initializes the `TheiaAgent` or subscribes to `EventBus` to update the UI (e.g., "Thinking" indicators, TTS playback).
*   **`contexts/SpecContext.tsx`**: The Spec-Driven architecture implementation.
    *   *Relationship:* Implements the "Hexagonal" input ports defined in `phase7-spec-driven-architecture.md`.

## 3. Modules (Feature Slices)
*   **`src/modules/planner/`**: Contains types used by `Agent.ts` (`AgentPlan`).
*   **`src/modules/search/`**: Contains `searchService` used by `Agent.ts` (`find_file` tool).
*   **`src/modules/persistence/`**: Contains `storageService` used by `Agent.ts` (session save/load).
*   **`src/modules/navigation/`**: Handles file tree state (`ghost` vs `hot` nodes).

## 4. Utilities
*   **`src/utils/VoiceUtils.ts`**: Used by `Agent.ts` for `sanitizeForVoice`.
*   **`src/utils/fileUtils.ts`**: General file ops, likely used by `FileAdapter` (Phase 7).
