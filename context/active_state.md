# Active State

## 1. Current Focus
**Phase 7: QA Infrastructure - Voice IQ Smoke Test**
- Implemented end-to-end Voice IQ test (`tests/voice-iq.spec.ts`)
- Exposed `__THEIA_SIMULATE_SPEECH__` hook in `LiveContext.tsx` to bypass STT
- Fixed `DirectorService.ts` to use correct GenAI SDK API
- All 3 IQ tests pass, proving Director→Actor pipeline works with real Gemini API

## 2. Active Branch
- **Current:** `dev`

## 3. Known Issues
- None critical. Voice modes and IQ tests are stable.

## 4. Architecture Constraints
- `ContextBrief` must be < 1000 tokens.
- Precision Mode uses `window.speechSynthesis` (Browser TTS), not Gemini Audio.
- Test hooks (`__THEIA_VOICE_STATE__`, `__THEIA_CONTEXT_STATE__`, `__THEIA_SIMULATE_SPEECH__`) are dev-only.

## 5. Recent Completions
- [x] **Voice IQ Smoke Test** (2024-12-24)
  - Created `tests/voice-iq.spec.ts` with 3 E2E tests
  - Refactored `handleSpeechResult` in `LiveContext.tsx`
  - Exposed `__THEIA_SIMULATE_SPEECH__` test hook
  - Fixed `generatePrecisionResponse` API and model (`gemini-2.0-flash`)
  - Tests prove LLM sees file context and answers correctly

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
  - Added 5 E2E tests for voice mode code paths

## 6. Next Steps
- Commit Voice IQ test changes to `dev` branch
- Consider adding more complex IQ scenarios (multi-turn, tool calls)
- Explore cross-file context grounding tests
