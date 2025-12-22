# Active Context State

## 1. Current Focus
**Phase 2: State-Driven Diagram Navigation** (COMPLETED)
- **Status:** Done & Verified.
- **Key Changes:**
  - `MermaidRenderer`: Implemented `enhanceClickableAreas` (index-based SVG overlay) to fix "hard to click" lines.
  - `PRContext`: Updated `MapsToCode` with race-condition locking (`isNavigating`) and `waitForFileLoad`.
  - `types`: Updated `CodeReference` and `NavigationTarget`.
- **Verification:** `tests/diagram-navigation.spec.ts` passes.

## 2. Active Branch
* **Current:** `feature/state-driven-diagram-navigation`
* **Target:** `dev`

## 3. Architecture Constraints (DO NOT BREAK)
* **Strict Git Flow:** Never push to main. Always PR to dev.
* **Navigation:** Always use `MapsToCode` (Context) instead of DOM globals.
* **Testing:** All features must have Playwright tests.

## 4. Next Actions (Backlog)
* [ ] Merge `feature/state-driven-diagram-navigation` to `dev`.
* [ ] **Phase 3:** UI Stability & Interaction Polish.
  - Fix "Refresh Diagram" button (currently broken).
  - Fix "Row Click" bug (Annotations should only trigger on Gutter click, not whole row).
  - *Ref:* `Bugs 2cc7521e4f658047ad84c00b1b6a7996.md`
