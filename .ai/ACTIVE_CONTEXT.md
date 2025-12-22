# Active Context State

## 1. Current Focus
**Phase 3: UI Stability & Interaction Polish** (COMPLETED)
- **Status:** Done & Verified.
- **Key Changes:**
  - `DiagramPanel`: Fixed "Refresh" button by clearing state before re-fetching.
  - `SourceView`: Fixed "Row Click" bug by restricting `onClick` to the gutter element (`.line-number`).
  - **Verification:** `tests/ui-stability.spec.ts` passes.

## 2. Active Branch
* **Current:** `feature/ui-stability-polish`
* **Target:** `dev`

## 3. Architecture Constraints (DO NOT BREAK)
* **Strict Git Flow:** Never push to main. Always PR to dev.
* **Testing:** All features must have Playwright tests.
* **Configuration:** `playwright.config.ts` must always be `headless: true`.

## 4. Next Actions (Backlog)
* [ ] Merge `feature/ui-stability-polish` to `dev`.
* [ ] **Phase 4:** Two-Way Linear Traceability.
  - *Goal:* Click a Requirement in Linear Panel -> Navigate to relevant Code.
  - *Ref:* `backlog.md` (Item 7).
  - *Dependencies:* Uses `ChatContext.updateUserContext` and `PRContext.navigateToCode`.
