---
type: Repository Guide
title: Theia repository quickstart
description: Entry point for Theia, a browser-only React workspace that turns GitHub pull requests into navigable AI-assisted code reviews.
tags: [theia, code-review, react, vite, quickstart]
resource: https://localhost:5173
---

# Theia repository quickstart

Theia is a single-page React application for reviewing GitHub pull requests in a workspace that combines a file tree, source and diff viewer, AI chat, specification traceability, voice, diagrams, and an in-browser runtime. The current architecture is the code-aligned source of truth; material under `docs/archive/` is historical and may conflict with the implementation (`ARCHITECTURE.md`, `README.md`).

## Start here

```bash
npm install
npm run dev
```

Open http://localhost:5173 and choose **Load Sample PR**. This path uses `src/mock/samplePR.ts`, needs no `.env`, API key, or network, and is the fastest way to understand the UI. Real GitHub reviews and AI features require configuration described in [runtime and integrations](runtime-and-integrations.md).

The main local completion gate is:

```bash
npm run check
```

It runs typechecking, unit tests, a production build, relative-import validation, and Playwright tests in sequence. There is no general CI workflow enforcing this gate, so run it before considering a code change complete.

## What the product does

A reviewer loads a PR or repository, navigates files and lines, and asks questions in either a fast streaming Chat engine or a tool-using Agent engine. Agent actions are emitted as typed events so they can navigate the viewer, switch panels, inspect or change files, run commands, and request approval without directly owning React state. Review artifacts such as chat history, diagrams, notes, and verification state are stored in browser `localStorage`.

## Documentation map

- [Architecture overview](architecture/overview.md) explains entrypoints, provider composition, the EventBus, and the boundaries between UI, engines, and services.
- [Review lifecycle](workflows/review-lifecycle.md) explains sample and GitHub ingestion, caching, navigation, and browser persistence.
- [Agent architecture](agent/architecture.md) explains the Planner → Executor loop, structured plan parsing, tools, repair mode, and approval flow.
- [Runtime and integrations](runtime-and-integrations.md) explains Gemini, GitHub, Linear, voice, Mermaid, WebContainer, and credential boundaries.
- [Testing and quality gates](testing/quality-gates.md) explains unit and E2E coverage, quarantined specs, local checks, and known quality risks.

## Where to change things

- Change application composition or cross-feature event contracts in `src/App.tsx`, `src/contexts/`, and `src/modules/core/EventBus.ts`; update the [architecture overview](architecture/overview.md).
- Change PR loading or repository navigation in `src/modules/ingestion/PRSourceService.ts`, `src/services/github.ts`, `src/contexts/PRContext.tsx`, and `src/modules/navigation/`; update the [review lifecycle](workflows/review-lifecycle.md).
- Change Agent behavior in `src/modules/core/Agent.ts` and `src/modules/core/agent/`; preserve the planner/executor contract and focused tests described in [Agent architecture](agent/architecture.md).
- Change browser integrations or credentials in `src/modules/runtime/`, `src/modules/core/genaiClient.ts`, `src/lib/credentials.ts`, and `src/services/`; update [runtime and integrations](runtime-and-integrations.md).
- Change behavior safely by running the relevant unit tests first, then `npm run check`; see [testing and quality gates](testing/quality-gates.md).

## Current cautions

- Gemini calls are made directly from browser code; there is no backend proxy. Vite-exposed keys therefore need deployment and quota consideration.
- Agent shell execution is powerful. The current runtime accepts commands through WebContainer and streams output, while approval is handled at the Agent tool layer; resource limits and cancellation are not documented as implemented safeguards.
- `QA_LOG.md` records an unresolved planning issue (`QA-001`) and Gemini quota/rate-limit concerns (`ENV-001`).

## Backlog

- **Agent execution safety and approvals** — `src/modules/core/agent/toolRegistry.ts`, `src/modules/core/agent/executorNode.ts`; audit every tool's approval classification and runtime resource limits.
- **Persistence lifecycle** — `src/modules/persistence/StorageService.ts`; document quota, expiry, migration, and isolation behavior if those policies are added or clarified.
- **Full integration behavior** — `tests/quarantine/` and `docs/archive/`; default tests intentionally avoid real Gemini, Linear, and network dependencies, so archived product requirements are not treated as current behavior.
