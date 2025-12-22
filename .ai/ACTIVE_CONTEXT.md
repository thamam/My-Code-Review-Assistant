# Active Context State

## 1. Current Focus
**Phase 1: Context Awareness System** (COMPLETED)
- **Status:** Done & Verified.
- **Key Changes:**
  - `UserContextMonitor`: Headless component bridging UI -> Chat.
  - `ChatContext`: Uses `useRef` for `userContext` to prevent render loops.
  - `SourceView.tsx`: Refactored to use event delegation for robust selection tracking.
  - `playwright.config.ts`: Set to `headless: true`.
- **Verification:** `npx playwright test` passes (including "Code Selection" via `dblclick`).

## 2. Active Branch
* **Current:** `feature/context-awareness-system`
* **Target:** `dev`

## 3. Architecture Constraints (DO NOT BREAK)
* **Strict Git Flow:** Never push to main. Always PR to dev.
* **Performance:** Do not add context logic to `PRContext`. Use `ChatContext` refs.
* **Testing:** No new UI features without E2E tests.

## 4. Next Actions (Backlog)
* [ ] Merge `feature/context-awareness-system` to `dev`.
* [ ] **Phase 2:** State-Driven Diagram Navigation (Fixing the "Click" bug).
  - *Ref:* `theia-diagram-navigation-spec.md`
  - *Goal:* Replace `window` globals with React Context for Mermaid clicks.
