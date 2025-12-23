# Active State

## 1. Current Focus
**Phase 7: Precision Mode & Live Upgrade**
- Implemented "Precision Mode" using Gemini 3 Pro (via DirectorService).
- Upgraded Live Mode to Gemini 2.5 Flash Native Audio Preview.
- Added Conversation Export for debugging.

## 2. Active Branch
- **Current:** `dev` (merged from `feature/gemini-3-precision`)

## 3. Known Issue
- **Symptom:** Actor ignoring whispered context is still under investigation, but Precision Mode provides a grounded workaround.

## 4. Architecture Constraints
- `ContextBrief` must be < 1000 tokens.
- Precision Mode uses `window.speechSynthesis` (Browser TTS), not Gemini Audio.

## 5. Recent Completions
- [x] **Precision Mode (Gemini 3 Pro)**
  - Manual STT -> LLM -> TTS loop.
  - Grounded with full file content.
- [x] **Live Mode Upgrade**
  - Switched to `gemini-2.5-flash-native-audio-preview-12-2025`.
- [x] **Logging**
  - Added Session Export (JSON).

