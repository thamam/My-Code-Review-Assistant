# Active Context State

## 1. Current Focus
**Phase 5: Agent Intelligence & Anti-Hallucination** (COMPLETED)
- **Status:** Done & Verified.
- **Key Changes:**
  - `ChatContext`: Now injects **actual file content** (with line numbers) into the prompt.
  - **System Prompt:** "Senior Staff Engineer" persona + Strict "Manifest is Truth" constraints.
  - **Voice Fix:** Restored Zephyr voice and transcription settings in `LiveContext`.
  - **Tests:** Added `npm run test:guards` to verify context injection and config.

## 2. Active Branch
* **Current:** `feature/agent-intelligence-grounding`
* **Target:** `dev`

## 3. Architecture Constraints
* **AI Grounding:** All AI answers must be based on the injected `[FILE CONTENT]` block.
* **Configuration:** `playwright.config.ts` must be `headless: true`.
* **Voice:** Use `gemini-2.0-flash-exp`.

## 4. Next Actions (Backlog)
* [ ] Merge `feature/agent-intelligence-grounding` to `dev`.
* [ ] **Phase 4:** Two-Way Linear Traceability.
  - *Goal:* Link Requirements <-> Code.
  - *Ref:* `backlog.md` (Item 7).
  - *Note:* Now that Theia can "see" the code, she can accurately map Linear requirements to specific lines.
