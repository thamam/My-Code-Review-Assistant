# Active Context State

## 1. Current Focus
**Phase 4: Two-Way Linear Traceability** (COMPLETED)
- **Status:** Done & Verified.
- **Features:** "Find It" (Target Icon) and "Verify It" (Context Menu).
- **User Feedback:**
  - Feature works well but lacks discoverability.
  - Request: Add a "?" Help Tooltip to explain buttons.
  - Request: Support bundling multiple Linear issues (Backlog).

## 2. Active Branch
* **Current:** `feature/linear-traceability`
* **Target:** `dev`

## 3. Architecture Constraints
* **UX:** Tooltips must be unobtrusive but clear.
* **Testing:** "Find It" tests skipped (requires live API), but logic verified manually.

## 4. Next Actions (Backlog)
* [ ] Merge `feature/linear-traceability` to `dev`.
* [ ] **Phase 4.5: UX Polish.**
  - Add "?" Tooltip to Linear Panel explaining the Target/Sync buttons.
* [ ] **Phase 6: Director/Actor Architecture.**
  - Split "Thinking" (Gemini 1.5 Pro) from "Speaking" (Gemini 2.0 Flash).
* [ ] **Future:** Support Multi-Issue bundling in Review.
