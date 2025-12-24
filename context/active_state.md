# Active State

## 1. Current Focus
**Phase 7: Spec-Driven Traceability**
- **Goal:** Decouple "Requirements" from "Linear".
- **Architecture:** Adapter Pattern (Linear/Markdown) -> Atomizer (Gemini 3 Pro) -> Conductor.

## 2. Active Branch
- **Current:** `feature/phase7-spec-architecture`
- **Base:** `dev`

## 3. Recent Completions
- [x] **Phase 6.5 (Voice QA):**
    - Upgraded Director to `gemini-3-pro-preview`.
    - Implemented deterministic State Inspection for E2E tests.
    - Verified "Voice IQ" with `voice-iq.spec.ts`.

## 4. Architecture Constraints
- **Model:** All "Thinking" tasks (Atomization, Director) MUST use `gemini-3-pro-preview`.
- **Live Mode:** Continues to use `gemini-2.5-live`.
- **State:** `SpecDocument` is the single source of truth for requirements.

## 5. Next Steps
- Implement `SpecTypes.ts` (The universal interfaces).
- Build the `AtomizerService` using Gemini 3 Pro.
- Refactor Linear integration to use the Adapter pattern.
