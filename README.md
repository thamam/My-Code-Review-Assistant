# Theia — AI Code Review Assistant

A single-page React app that turns a GitHub pull request into a reviewable workspace: file tree, diff/source viewer, AI chat (two engines — a fast streaming Chat mode and a tool-calling Agent mode), spec traceability, voice, and auto-generated Mermaid diagrams. See [ARCHITECTURE.md](ARCHITECTURE.md) for how it's built.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. Click **Load Sample PR** to explore the app with local fixture data — no API key, no `.env`, no network calls required for this path.

To review a real GitHub PR, or use the AI chat/voice/diagram features, add a `.env` (see `.env.example`):

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here   # required for any AI feature
VITE_GITHUB_TOKEN=your_github_token_here        # optional — raises GitHub API rate limits
VITE_LINEAR_API_KEY=your_linear_api_key_here    # optional — Linear issue linking
```

See [ARCHITECTURE.md § API keys](ARCHITECTURE.md#api-keys--what-needs-one-and-what-doesnt) for exactly what each key gates.

## Gates

```bash
npm run check
```

Runs, in order: typecheck (`tsc --noEmit`), unit tests (`vitest run`), production build (`tsc && vite build`), the relative-import-path checker (`tools/check-paths.mjs`), and the Playwright e2e suite. Stops at the first failure. This is a local command, not a CI workflow — run it before you consider a change done.

Individual pieces, if you want to run just one:

```bash
npx tsc --noEmit
npx vitest run
npx vite build
node tools/check-paths.mjs
npx playwright test
```

## Tests

- `tests/unit/` — Vitest unit tests, no browser, no network.
- `tests/boot-smoke.spec.ts`, `tests/neural-loop.spec.ts` — the Playwright specs Stage E verified pass offline with no API key; these are what `npx playwright test` runs by default.
- `tests/quarantine/` — 18 older Playwright specs excluded from the default run (real Gemini/Linear/network dependencies, not mocked). See `tests/quarantine/README.md`.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — entry point, `src/` layout, the EventBus, what Agent mode is, models in use.
- `docs/archive/` — everything that used to live in `docs/` and `design_docs/`. Kept for history, not deleted, but pre-simplification and unverified against the current code — see `docs/archive/README.md` before trusting anything in there.
