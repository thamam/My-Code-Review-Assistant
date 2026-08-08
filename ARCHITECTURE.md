# Architecture

This document describes the app as the code currently is. It supersedes every architecture document under `docs/archive/` — those are pre-simplification and some of them actively disagree with the code and with each other; see `docs/archive/README.md`.

## What this is

A single-page React app (no backend server) that turns a GitHub pull request into a reviewable, navigable workspace: a file tree, a diff/source viewer, an AI chat assistant, spec traceability, and auto-generated Mermaid diagrams. All Gemini calls are made directly from the browser via `@google/genai`'s web client — there is no proxy server in this repo.

## Entry point

`index.html` loads `src/index.tsx` as a module script. `index.tsx` mounts `src/App.tsx` into `#root` under `React.StrictMode`. `App.tsx` wires up the context providers (`PRProvider`, `ChatProvider`, `LiveProvider`, `SpecProvider`) and lays out the three-pane shell: left (file tree / annotations / specs / diagrams / terminal / whiteboard tabs), center (code viewer), right (chat panel).

There is one `src/` root — no client/server split, no second app tree.

## `src/` layout

- **`components/`** — React UI: `FileTree/`, `CodeViewer/`, `ChatPanel/`, `Diagrams/`, `Annotations/`, `Specs/`, `Walkthrough/`, `Whiteboard/`, `RuntimePanel/`, plus top-level pieces like `WelcomeScreen.tsx` and `ApprovalRequest.tsx` (the human-in-the-loop approval modal for Agent mode).
- **`contexts/`** — React context/state: `PRContext` (loaded PR data, file tree, selection, diff mode), `ChatContext` (chat messages, engine selection, the EventBus subscription — see below), `LiveContext` (voice session state), `SpecContext` (spec traceability state).
- **`modules/core/`** — the app's control plane: `EventBus.ts` (see below), `Agent.ts` (the Agent-mode engine, a LangGraph state machine), `SimpleChat.ts` (the Chat/simple-mode engine), `genaiClient.ts` (the single lazily-constructed `GoogleGenAI` client), `simpleChatConfig.ts`, `ContextSnapshot.ts`, `FlightRecorder.ts`, `TraceService.ts`, `types.ts` (the full EventBus event catalog).
- **`modules/runtime/`** — `WebContainerService.ts`: an in-browser Node.js sandbox (`@webcontainer/api`) that Agent mode's `AGENT_EXEC_CMD` tool runs shell commands in. The singleton subscribes to the EventBus on construction, but the actual WebContainer instance boots lazily on the first `AGENT_EXEC_CMD`/`SYSTEM_FILE_SYNC` event; needs no API key.
- **`modules/navigation/`** — resolves `file:line` references (from chat, diagrams, or search) into file-tree/viewer navigation; also fetches lazy-loaded ("ghost") files for Full Repo Mode.
- **`modules/ingestion/`** — `PRSourceService.ts`: fetches PR data from GitHub and caches it.
- **`modules/persistence/`** — `StorageService.ts`: `localStorage`-backed save/restore of chat history, review state, diagrams, notes.
- **`modules/search/`** — local, in-browser full-text search over PR file contents (`minisearch`), used by the Agent's search tool.
- **`modules/planner/`** — shared types for the Agent's plan/step data structures.
- **`modules/voice/`** — `TTSService.ts`: text-to-speech for AGENT_SPEAK output.
- **`services/`** — `AtomizerService.ts` (spec-to-requirements atomization), `BrainService.ts` and `DirectorService.ts` (context-brief generation for the Live voice session), `diagramAgent.ts` (Mermaid diagram generation), `VoiceService.ts` (Web Speech API + AGENT_SPEAK), `github.ts` / `linear.ts` (REST clients), `walkthroughParser.ts`.
- **`adapters/`** — `FileAdapter.ts` / `LinearAdapter.ts`: hexagonal ports that feed spec content into the Atomizer.
- **`prompts/`** — prompt-building functions: `systemPrompt.ts`, `contextEnvelope.ts`, `directorPrompt.ts`, `modeInstructions.ts`.
- **`lib/`** — `credentials.ts` (GitHub token / Linear key lookup and persistence — see below; the Gemini/Google Cloud keys are not part of it), plus `chat/`, `diagramRefs.ts`, `report/`, `requirements/`, `risk-scoring/`, `session-parser/` helper modules.
- **`types/`** — shared TypeScript types (`domain.ts`, `context.ts`, `contextBrief.ts`, `review.ts`, `SpecTypes.ts`, `session-parser.ts`).
- **`utils/`** — small pure helpers (`fileUtils.ts`, `diffUtils.ts`, `colorUtils.ts`, `downloadUtils.ts`, `VoiceUtils.ts`, `walkthroughUtils.ts`).
- **`mock/samplePR.ts`** — the fixture behind the "Load Sample PR" button; entirely local, no network.
- **`polyfills/`** — a browser polyfill for `node:async_hooks` (aliased in `vite.config.ts`) so a Node-targeting dependency doesn't break the browser build.

## The EventBus spine

`src/modules/core/EventBus.ts` is a pub/sub singleton (`eventBus`) that every part of the app — both chat engines, the UI, voice, navigation — talks through instead of calling each other directly. It keeps a 100-event ring buffer (`getHistory()`) for observability/debugging.

`ChatContext.tsx` subscribes to `'*'` once on mount and is the "hands" that turn Agent-emitted events into UI effects: `AGENT_SPEAK` (append chat text), `AGENT_NAVIGATE` (jump the code viewer to a file:line), `AGENT_TAB_SWITCH` (change the left-panel tab), `AGENT_DIFF_MODE` (toggle diff view), `AGENT_SESSION_RESTORED`, `AGENT_REQUEST_APPROVAL`, and more — the full catalog is in `modules/core/types.ts`. `AGENT_NAVIGATE` and `AGENT_TAB_SWITCH` are suppressed for 3 seconds after any tracked user mouse/keyboard activity (`USER_ACTIVITY`, emitted by `UserContextMonitor.tsx`) — a "focus lock" so the agent doesn't yank the UI out from under an actively-reviewing user.

For test injection, `ChatContext` also exposes the live bus as `window.__THEIA_EVENT_BUS__`, and `PRContext` exposes a state snapshot as `window.__THEIA_PR_STATE__`. `tests/neural-loop.spec.ts` verifies this wiring end-to-end.

## What "Agent mode" is

Every chat turn carries an `engine: 'simple' | 'agent'` flag (default `'simple'` — see `ChatContext.tsx`'s persisted engine state, and the `engine-toggle-simple` / `engine-toggle-agent` UI in `ChatPanel.tsx`). The flag routes the same `USER_MESSAGE` event to one of two independent engines, both subscribed on the EventBus:

- **Chat / simple mode** (`SimpleChat.ts`) — a fast, stateless-per-call streaming chat. No tools, no function-calling; every turn replays the transcript to `generateContentStream` fresh. This is what `tests/quarantine/simple-mode.spec.ts` targets (see that file's quarantine note for why it's not in the default run).
- **Agent mode** (`Agent.ts`, class `TheiaAgent`) — a LangGraph (`@langchain/langgraph`) state machine implementing a Planner → Executor loop with tool-calling: it can search the PR (`modules/search`), read/write files, run shell commands in the in-browser WebContainer sandbox (`modules/runtime`), generate diagrams, and drive the UI via `AGENT_NAVIGATE` / `AGENT_TAB_SWITCH` / `AGENT_DIFF_MODE`. Sensitive tool calls go through a human-in-the-loop approval gate (`PendingAction`, rendered by `ApprovalRequest.tsx`) before executing.

Both engines call Gemini through the single lazy client in `genaiClient.ts` (`getGenAI()` — constructed on first use, not at import time, which is why the app can boot with no key at all).

## Models in use (verified against source, current as of this stage)

| Model ID | Used for |
|---|---|
| `gemini-3.1-pro-preview` | Default chat/Agent model (deep reasoning) |
| `gemini-3-flash-preview` | "Fast" chat tier; also the diagram-generation model (`diagramAgent.ts`) |
| `gemini-2.5-flash-lite` | "Fastest" chat tier (excluded from Google Search grounding — see `simpleChatConfig.ts`) |
| `gemini-2.5-flash-native-audio-preview-12-2025` | Live voice mode (`LiveContext.tsx`) |

(`docs/archive/TECH_BRIEF.md` names a fifth ID, `gemini-3-pro-preview`, that appears nowhere in the current source — see that file's archive note.)

## Running the gates

`npm run check` chains, in order: `tsc --noEmit` → `vitest run` → `tsc && vite build` → `node tools/check-paths.mjs` → `npx playwright test`. It stops at the first failure (plain `&&` chaining), so a non-zero exit means look at the first failed step's output. There is no CI workflow for this — it's a local command the owner runs by hand.

## API keys — what needs one and what doesn't

`src/lib/credentials.ts` covers only `VITE_GITHUB_TOKEN` and `VITE_LINEAR_API_KEY`, and the two fall back asymmetrically: `getGitHubToken` reads, in order, a Vite env var, then `localStorage`, then `sessionStorage`; `getLinearKey` reads a Vite env var then `localStorage` only (no `sessionStorage` fallback — `saveLinearKey` only ever writes `localStorage`, matching the existing LinearModal policy of no session-vs-persistent toggle). The module offers `saveGitHubToken`/`saveLinearKey`/`clearGitHubToken` to persist or clear them.

`VITE_GEMINI_API_KEY` and `VITE_GOOGLE_CLOUD_API_KEY` do **not** go through `credentials.ts` — every caller (`genaiClient.ts`, `LiveContext.tsx`, `AtomizerService.ts`, `BrainService.ts`, `DirectorService.ts`, `TTSService.ts`) reads `import.meta.env.VITE_GEMINI_API_KEY` / `VITE_GOOGLE_CLOUD_API_KEY` directly. There is no `localStorage`/`sessionStorage` fallback for either — they must be set as a Vite env var (`.env`) or the corresponding Gemini/TTS feature fails. See `.env.example` for all four vars.

**Needs `VITE_GEMINI_API_KEY`:** anything that calls Gemini — Chat mode, Agent mode, Live voice, diagram generation, spec atomization (`AtomizerService`), context-brief generation (`BrainService`/`DirectorService`). Without it, those features fail with a friendly "API key missing or rejected" message (`describeChatError` in `simpleChatConfig.ts`) — they do not crash the app.

**Does not need any key:** booting the app, loading the sample PR (`mock/samplePR.ts`), browsing the file tree, viewing diffs/source, the file-tree/annotation/spec/diagram *panels themselves* (as opposed to the AI features that populate them from scratch). Fetching a *real* public GitHub PR also works without `VITE_GITHUB_TOKEN` (unauthenticated GitHub API rate limits apply); the token only raises those limits. `VITE_LINEAR_API_KEY` is only needed for Linear issue linking.

## Running with no key

Don't create a `.env`. `npm run dev` (or Playwright's own `webServer`), open the app, click "Load Sample PR" — the file tree, diff viewer, and UI all work. `tests/boot-smoke.spec.ts` is the automated proof of exactly this path.
