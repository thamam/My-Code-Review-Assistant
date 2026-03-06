# Production Hardening — Remaining Tasks

> Branch: `production-hardening` (branched from `dev`)
> Last updated: 2026-03-06

## Status Summary

Tests: 71/71 passing
TypeScript: 0 errors
Build: clean

---

## Completed

- Context chain audit and fix: `selectionState`, `isDiffMode`, `viewportState`, `focusedLocation` all flow from `PRContext` → `ChatContext` refs → `EventBus USER_MESSAGE` → `Agent.buildContextEnvelope`
- `buildContextEnvelope` now injects 6 signals: `ACTIVE_FILE`, `VIEW_MODE`, `ACTIVE_TAB`, `VISIBLE_LINES`, `FOCUSED_LINE`, `SELECTED_CODE`
- `SourceView` viewport tracking via `LineMarker` + `IntersectionObserver` (was completely blind before)
- `DiffView` viewport tracking (already existed, but see bugs below)
- `ChatContext` context snapshot: 11 fields including selectionText, selectionStartLine, selectionEndLine, isDiffMode
- I1 Session Parser (`src/lib/session-parser/`) — full JSONL parser with BFS topological sort, tool correlation, file tracking
- Theia Review type system (`src/types/review.ts`)
- Vitest config with ESM `.js`→`.ts` resolution plugin
- 18 context injection tests + 45 session parser tests
- `plannerNode` and `reasoningNode` system instructions updated to reference all new signals

---

## Immediate: Code Quality Bugs (HIGH ROI)

### 1. Extract `useViewportTracker` hook  [DONE]
File: `components/CodeViewer/useViewportTracker.ts`
**Problem**: `handleLineVisibility` logic is verbatim duplicated in `DiffView` and `SourceView`. DiffView's version is NOT wrapped in `useCallback`, causing every render to recreate the function, which causes all 2000 `LineMarker` IntersectionObservers to disconnect and reconnect (because `[lineNumber, onVisible]` are the deps). This fires on every `setHoveredLine` call.
**Fix**: Extract to shared hook, always wrap in `useCallback`.

### 2. Add unmount cleanup for `updateTimeout`  [DONE]
Both `DiffView` and `SourceView` store a `setTimeout` ref that fires `onViewportChange`. If the file changes before the timeout fires, a stale callback calls `onViewportChange` with the old file path.
**Fix**: `useEffect(() => () => clearTimeout(updateTimeout.current), [])` in the hook.

### 3. Extract shared syntax helpers  [DONE]
File: `components/CodeViewer/syntaxHelpers.tsx`
**Problems**:
- `getLanguage` defined twice with diverging logic (DiffView missing `.py`)
- `renderToken` + `HighlightedText` copy-pasted with different thresholds (500 vs 1000)
**Fix**: Single source of truth with 1000-char threshold and full language support.

---

## Medium Priority: Type Safety

### 4. TypeScript interface for context snapshot  [DONE]
`AgentState.context` is typed `any`. The actual shape has 11 fields.
File: `src/modules/core/Agent.ts` or new `src/types/context.ts`
```ts
interface ContextSnapshot {
  activeTab: 'files' | 'annotations' | 'issue' | 'diagrams';
  activeFile: string | null;
  activeSelection: string | null;
  activeDiagram: string | null;
  viewportStartLine: number | null;
  viewportEndLine: number | null;
  focusedLine: number | null;
  isDiffMode: boolean;
  selectionStartLine: number | null;
  selectionEndLine: number | null;
  selectionText: string | null;
}
```

### 5. Fix redundant `activeFile` spread in `ChatContext.sendMessage`  [DONE]
`contextSnapshot` spreads `userContextRef.current` (which includes `activeFile`) then immediately overwrites `activeFile`. The spread is misleading.
**Fix**: Destructure to exclude `activeFile` from the spread: `const { activeFile: _, ...rest } = userContextRef.current`.

---

## Low Priority: Latent Bugs

### 6. Double context injection (dead code, latent)  [DONE]
`reasoningNode` (currently disconnected from the LLM graph) builds a `contextSuffix` that injects another `[SYSTEM_CONTEXT]` block. If reconnected, every LLM call would get the context twice.
**Fix**: `reasoningNode` should call `buildContextEnvelope()` instead of building its own suffix.

---

## Future: PRD Features

### F1: Review Map
File tree with `VerificationState` badges. Requires wiring `ReviewSession` to file selection.
Types: `src/types/review.ts` (already defined)

### F2: Hierarchical Context
Section summaries from walkthrough shown as collapsible context in chat.

### F3: Checkpoints + Report
Milestone tracking. `ReviewReport` type already defined.

### F4: PR Memory
Persist review state across sessions. `storageService` exists; needs `ReviewSession` serialization.

### F5: Whiteboard
Freeform annotation canvas. Not started.

### I2: Prompt→Requirements
Parse system prompt to extract implied requirements for review coverage.

### I3: Risk Scoring
Use session parser data to score files by risk (filesNotRead, error sequences, etc.).

### I1 Integration
Wire session parser to UI — allow user to drop a `.jsonl` file and see the session walkthrough.

---

## Architecture Notes

- **Context chain**: `PRContext` → `ChatContext` refs (stale-closure-safe) → `EventBus USER_MESSAGE` → `Agent.buildContextEnvelope` → `[SYSTEM_CONTEXT]` in AI prompt
- **Viewport tracking**: `LineMarker` (IntersectionObserver per row) → `handleLineVisibility` (Set + 100ms debounce) → `onViewportChange` → `PRContext.updateViewport`
- **Test locations**: `tests/unit/core/` — `ContextInjection.test.ts` (18 tests), `session-parser.test.ts` (45 tests)
- **Vitest ESM fix**: custom plugin in `vitest.config.ts` rewrites `.js` → `.ts` for resolution
