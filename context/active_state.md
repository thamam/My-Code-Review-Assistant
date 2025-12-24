# Active State

## 1. Current Focus
**Phase 7: QA Infrastructure - Deterministic Testing**
- Refactored `director-actor.spec.ts` from console-log parsing to State Inspector pattern.
- Added `__THEIA_VOICE_STATE__` test hook to `LiveContext.tsx`.
- All 5 tests pass deterministically (6.1s).

## 2. Active Branch
- **Current:** `dev`

## 3. Known Issues
- None critical. Voice modes and tests are stable.

## 4. Architecture Constraints
- `ContextBrief` must be < 1000 tokens.
- Precision Mode uses `window.speechSynthesis` (Browser TTS), not Gemini Audio.
- Test hooks (`__THEIA_VOICE_STATE__`, `__THEIA_CONTEXT_STATE__`) are dev-only.

## 5. Recent Completions
- [x] **QA Refactoring: Deterministic Tests** (2024-12-24)
  - Created `tests/fixtures/fake_audio.wav` (5s silence)
  - Updated `playwright.config.ts` with fake media stream args
  - Added `__THEIA_VOICE_STATE__` to `LiveContext.tsx`
  - Deleted all console-log assertions from tests
  - 5 tests pass in 6.1s without flaking

- [x] **Voice Mode Bug Fixes** (2024-12-24)
  - Fixed stale closure bug (modeRef)
  - Fixed TTS language mismatch
  - Made no-speech non-fatal
  - Switched to gemini-2.5-flash for Precision Mode
  - Added 5 E2E tests for voice mode code paths

## 6. Next Steps
- Commit QA refactoring changes to `dev` branch
- Consider audio injection tests for actual voice interaction flows
- Expand State Inspector pattern to other test suites
