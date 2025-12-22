# Active Context State

## 1. Current Focus
**HOTFIX: Restore Voice Conversation Mode** (COMPLETED)
- **Status:** Done & Verified.
- **Model:** Switched to `gemini-2.0-flash-exp` (Stable).
- **Fixes:**
  - Fixed stale closure in `onclose`.
  - Added connection warmup delay (1s).
  - Improved error separation (Auth vs. Mic).

## 2. Active Branch
* **Current:** `fix/voice-mode-connection`
* **Target:** `dev`

## 3. Architecture Constraints
* **Configuration:** `playwright.config.ts` must be `headless: true`.
* **Agent Persona:** (Upcoming Phase 5) Stop "Teacher Mode". Be a "Staff Engineer".

## 4. Next Actions (Backlog)
* [ ] Merge `fix/voice-mode-connection` to `dev`.
* [ ] **Phase 5: Agent Intelligence & Anti-Hallucination.**
  - *Goal:* Fix "Blindness" (Inject active file content) + Fix "Persona" (Stop Socratic questioning).
  - *Ref:* `ChatContext.tsx`
