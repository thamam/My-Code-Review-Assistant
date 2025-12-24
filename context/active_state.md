# Active State

## 1. Current Focus
**Phase 9: Full Repository Access**
- **Goal:** Enable loading/toggling non-PR files to trace complete flows.
- **Priority:** Critical for complete Diagram Navigation support.

## 2. Active Branch
- **Current:** `feature/phase9-full-repo`
- **Base:** `dev`

## 3. Recent Completions
- [x] **Phase 8: Diagram-Driven Navigation** [Complete]
    - Created `DiagramTypes.ts` (CodeReference, NavigationTarget).
    - Built `DiagramParser.ts` for § syntax parsing.
    - Added CSS styles for clickable diagram elements.
    - E2E tests for diagram navigation (4 passed, 1 skipped).
- [x] **Phase 7: Spec-Driven Traceability** [Complete]
    - Built Adapter Pattern (Linear/Markdown).
    - AtomizerService using Gemini 3 Pro.
    - SpecPanel UI with atomic requirements display.
- [x] **Phase 6.5 (Voice QA):**
    - Upgraded Director to `gemini-3-pro-preview`.
    - Implemented deterministic State Inspection for E2E tests.

## 4. Architecture Constraints
- **Model:** All "Thinking" tasks (Atomization, Director) MUST use `gemini-3-pro-preview`.
- **Live Mode:** Continues to use `gemini-2.5-live`.
- **State:** `SpecDocument` is the single source of truth for requirements.
- **Diagrams:** Use `§filepath:line` syntax for code references in Mermaid diagrams.

## 5. Next Steps
- Design Full Repo Access API (file loading, caching).
- Implement file browser for non-PR files.
- Update DiagramParser to resolve paths against full repo.

## 6. Backlog
- [ ] **Feature: Full Repo Context** - In Progress (Phase 9).

