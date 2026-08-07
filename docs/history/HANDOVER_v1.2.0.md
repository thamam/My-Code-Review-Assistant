# Handover — Theia v1.2 "Fusion" (Beta)

**Date:** 2026-08-08 · **HEAD:** `fcd2a27` on `main` · **Tag:** `v1.2-fusion` · **Baseline:** tag `pre-fusion` (`00e99b3`)
**Gates at handover:** `tsc --noEmit` clean · vitest **265/265** (21 files) · Playwright NOT run (needs dev server + API key)

## What v1.2 is

The fusion of two forks of this app, executed in five phases (31 commits), all dual-reviewed (Opus + GLM) before merge:

1. **Prune** — dead modules (`core/graph.ts`, `DiagramParser`), session artifacts, debug scripts removed; docs made honest (v-story, LangSmith claim).
2. **Grounding** — chat model receives file content again (`ContextSnapshot.activeFileContent`, limit defined once in `src/types/context.ts`); model selector wired for real (`gemini-3.1-pro-preview` + `thinkingLevel: HIGH` — NOT thinkingBudget, that 400s on 3.x; `gemini-2.5-flash-lite` is the real lite id); roster reconciled in DirectorService/AtomizerService.
3. **Feature ports from the sibling fork** (`Code-Reviw-Forked-Studio-Vesrion2`) — review-intent modes (`src/prompts/modeInstructions.ts` is the single source, feeds Agent + Director); structure diagrams (class/state/flowchart, type picker in DiagramPanel); proactive voice Brain (`src/services/BrainService.ts`, debounced `[BRAIN UPDATE]` into live sessions); per-PR persistence for diagrams + chat (`StorageService`, `THEIA_DIAGRAMS_V1_`/`THEIA_CHAT_V1_`).
4. **Simple Mode (the big one)** — `src/modules/core/SimpleChat.ts` is a second brain on the EventBus, routed by `USER_MESSAGE.payload.engine` (**absent ⇒ 'simple'** — the safe default). Stateless per-turn `generateContentStream` (no SDK chat session — deliberate: kills envelope accumulation + cross-PR history injection). Google Search grounding + citation chips live ONLY here (agent path must stay grounding-free — `ModelConfig.test.ts` asserts it). Prompt builders live in `src/prompts/` (`contextEnvelope.ts`, `systemPrompt.ts`); `Agent.ts` keeps behavior-locked delegates. Design doc: Opus-authored, archived in the fusion session logs.
5. **Architecture fixes both forks always shared** — `src/lib/credentials.ts` (one env→localStorage→sessionStorage resolver; NavigationService late-binds; UI token field overrides env per-load); `src/modules/navigation/lineRegistry.ts` (registration handshake replaced all three polling timers; side-aware keys — deleted lines register under `old:` coords; fail-open fallback via `findNearestLine`/top-of-file); `src/lib/diagramRefs.ts` (deterministic ref ids, explicit binding plan, min-count ordinal fallback, persisted refs re-resolve); `src/modules/ingestion/PRSourceService.ts` (cache/history/load out of WelcomeScreen; sample PR is a real source with mock-backed `canFetchRemote: true`; per-file fetch failure marks `contentUnavailable` instead of failing the PR or caching ''); `components/CodeViewer/useLineInteractions.ts` (shared marker/label/selection hook; selections highlight by side:line coordinate membership; PRContext provider memoized — split deferred).

## Open items (tracked, honest)

- **QA-001 (P1)** — planner JSON leaking into chat — still open in **Agent mode**; Simple Mode bypasses, does not fix.
- **e2e specs** partly assume agent-mode-default; need an engine toggle per spec (`neural-loop.spec.ts` already patched with `engine:'agent'`). Playwright suite not run this cycle.
- **5 Gemini-client construction sites** still bypass `src/modules/core/genaiClient.ts`: DirectorService, AtomizerService, TTSService, diagramAgent, LiveContext.
- **PRContext** memoized but not split (55-member surface remains).
- Pre-existing: `btoa` cache-key crash on unicode PR URLs; ENV-001 (P2) rate limiting; 2.1 MB main bundle (needs code-splitting); Mermaid label-binding for sequence diagrams verified only at unit level.

## NEXT HIGHEST-VALUE ACTION

**Manual browser smoke test:** `cd .worktrees/integration && npm run dev` (needs `.env` with `VITE_GEMINI_API_KEY`; `.env.example` documents the vars). Checklist:
1. Load a real PR → chat streams into ONE growing bubble; answer quotes actual file lines (grounding).
2. Flash model + a searchable question → citation chips render.
3. Generate a diagram → click a node → viewer scrolls + flashes the right line (once).
4. Diff mode → left-click a DELETED line's gutter → marker appears; annotation click navigates back to it.
5. Toggle to Agent mode → divider message; agent still works; toggle back mid-conversation → memory retained.
6. Switch PRs → no conversation bleed; reload → diagrams + chat history restored.

## Ops notes for the next orchestrator session

Workers ran headless in tmux worktrees under `.worktrees/` (now pruned to `integration`). Invocations that work: Sonnet/Opus `CLAUDE_CODE_USE_BEDROCK= ANTHROPIC_MODEL= command claude --model <m> --dangerously-skip-permissions -p "…"`; GLM `crush run --cwd <wt> --model zai/glm-5.2 --quiet '…'` (ZAI key in macOS keychain `zai-api-key`); Kimi `kimi -p '…'` (plain `-p` only — `--auto`/`--yolo` are incompatible with it). Workers never touch git; lead commits/merges/gates in the integration worktree. The user's own checkout stays on `production-hardening`, untouched.
