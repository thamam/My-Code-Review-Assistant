# Theia Review — Architecture Mapping

[Version: 1.0 | 2026-03-05]

---

## How to Read This Document

For each PRD feature: **what Theia already has** → **what's missing** → **effort estimate** → **dependencies**. Then a build order at the end.

---

## Existing Theia Components (inventory)

| Component | What It Does | State Mgmt | Storage |
|-----------|-------------|------------|---------|
| **PR Ingestion** | GitHub REST API → PR metadata + file contents | PRContext | localStorage (cache) |
| **File Tree** | Hierarchical tree, color-coded by status (A/M/D) | PRContext | — |
| **Code Viewer** | Diff mode (line+word) + Source mode, viewport tracking | PRContext | — |
| **AI Chat** | Multi-model (Gemini Pro/Flash), context-aware prompting | ChatContext | In-memory |
| **Live Voice** | Gemini Native Audio, bi-directional transcription | LiveContext | In-memory |
| **Diagram Generator** | Gemini Flash → Mermaid sequence diagrams, zoomable canvas | PRContext | — |
| **Diagram→Code Nav** | Parse `(filename:line)` in Mermaid SVG → click to navigate | PRContext + DOM | — |
| **Linear Integration** | Link PR to Linear issue, inject acceptance criteria into AI | PRContext | localStorage |
| **Walkthroughs** | Load .json/.md guided tours → auto-navigate files+lines | PRContext | — |
| **Markers & Labels** | Quick markers (left-click) + detailed labels (right-click) | PRContext | localStorage, keyed by PR ID |
| **Navigation** | `scrollToLine` + fuzzy path matching (`arePathsEquivalent`) | PRContext | — |

---

## Feature-by-Feature Mapping

### F1 — Review Map

| Aspect | Status |
|--------|--------|
| **Exists** | File Tree (hierarchical, color-coded, expandable). Walkthroughs (guided navigation sequence). |
| **Gap** | File Tree is a *list*, not a *graph*. No dependency awareness — it mirrors the filesystem, not logical relationships. No per-node review state (unreviewed/inspected/verified). No visual progress. No concept of "review units" vs. files. |
| **What to build** | **New component.** A graph-based review map (likely React + d3 or a DAG layout library). Needs a data model that groups files into logical review units, computes dependency order, and tracks verification state per node. |
| **Inputs needed** | Dependency graph (from imports/requires analysis), file change data (from git diff), section-level verification state (new data model). |
| **Reusable** | PRContext already manages file selection — extend it to manage "current review unit" and verification state. Navigation (`scrollToLine`) works for node→code linking. |
| **Effort** | **Large.** New UI component + new data model + dependency analysis. The dependency analysis is the hard part — for TypeScript, `ts-morph` or `dependency-cruiser` can extract import graphs; for other languages, it gets harder. |

### F2 — Hierarchical Context

| Aspect | Status |
|--------|--------|
| **Exists** | Context-Aware Prompting already injects PR title, description, selected code, viewport lines, and Linear issue details into the AI. Walkthroughs have section-specific notes. |
| **Gap** | Context is currently *flat* — all injected at the same level into the AI prompt. No user-facing hierarchy. No breadcrumb trail. No collapsible narrative structure. No connection to the generation session (prompts, reasoning, files read). The "PR story" doesn't exist as a concept. |
| **What to build** | **New UI panel + new data model.** A collapsible tree component (PR → features → files → functions → lines) with each node carrying its own context slice. The tree structure comes from combining: (a) the session parser output (which prompts led to which files), (b) the dependency graph, (c) AST-level function/class boundaries. |
| **Inputs needed** | Session parser output (I1), AST parsing for function/class boundaries, mapping from prompts→files (I2). |
| **Reusable** | PR metadata fetching exists. The AI context injection logic can be refactored to populate the hierarchy instead of a flat prompt string. |
| **Effort** | **Large.** The data model is the core challenge — building the PR→feature→file→function hierarchy requires session parsing + AST analysis + an LLM pass to generate the "narrative" at each level. The UI (collapsible tree + breadcrumbs) is straightforward. |

### F3 — Review Checkpoints & Aggregated Report

| Aspect | Status |
|--------|--------|
| **Exists** | Markers (quick points of interest) and Labels (detailed annotations) — both persisted to localStorage keyed by PR ID. This is the closest existing feature. |
| **Gap** | Markers/Labels are point annotations, not section-level state markers. No 5-state verification model. No comment tagging (question/concern/suggestion/note). No report aggregation — annotations are stored but never compiled into a document. |
| **What to build** | **Extend existing annotation system.** Add section-level markers (function/class granularity) with 5-state tracking. Add tagged inline comments. Build a report generator that compiles all annotations + verification coverage + requirements coverage into an exportable markdown/JSON document. |
| **Inputs needed** | AST parsing (to define "sections"), verification state model (shared with F1's review map). |
| **Reusable** | Markers & Labels infrastructure — persistence model, PR-keyed localStorage, click-to-annotate UX. All of this extends rather than replaces. |
| **Effort** | **Medium.** The annotation extension is incremental. The report aggregator is new but straightforward — it reads state that other features produce. This is a natural "last mile" feature. |

### F4 — Context-Aware Chat with PR Memory

| Aspect | Status |
|--------|--------|
| **Exists** | Multi-model AI Chat with context injection (PR metadata, selected code, viewport lines, Linear issue). ChatContext manages streaming and message history. |
| **Gap** | No session data access (prompts, reasoning traces, tool calls from Claude Code). No awareness of review map state or verification progress. No persistent memory — chat history is in-memory and lost when you close the tab. No adversarial framing. |
| **What to build** | **Extend existing chat.** (1) Expand context injection to include: current review map node, verification state, requirements status, and generation session data for the current section. (2) Add a persistence layer — save chat messages + key Q&A pairs to localStorage (or IndexedDB for larger data), keyed by PR ID + user. (3) On session start, load previous chat memory and inject as context. (4) Adversarial system prompt for the review phase. |
| **Inputs needed** | Session parser output (I1), review map state (F1), verification state (F3). |
| **Reusable** | ChatContext is the base — the streaming, message rendering, and model switching all stay. The context injection pipeline just gets more inputs. |
| **Effort** | **Medium.** Most of the chat infrastructure exists. The main work is wiring additional context sources and adding persistence. The adversarial system prompt is a prompt engineering task, not a code task. |

### F5 — Whiteboard

| Aspect | Status |
|--------|--------|
| **Exists** | Diagram Generator (Gemini Flash → Mermaid), Interactive Canvas (zoom/pan), Diagram→Code Navigation (clickable elements). |
| **Gap** | Current diagrams are auto-generated from code changes — there's no user-triggered, question-driven generation. Diagrams don't accumulate (each generation replaces the previous). No dedicated "whiteboard" panel separate from the existing diagram viewer. No tie-in to chat (diagrams generated from chat questions don't route to the canvas). |
| **What to build** | **Extend existing diagram infrastructure.** (1) Add a "whiteboard" mode to the diagram panel that accumulates multiple diagrams (scrollable list or tabbed). (2) Connect chat to diagram generation — when the AI's response includes a Mermaid block, render it on the whiteboard instead of inline. (3) Persist whiteboard state per PR review session. (4) Reuse existing clickable diagram→code navigation. |
| **Inputs needed** | Chat output (F4), existing Mermaid rendering pipeline. |
| **Reusable** | The entire diagram pipeline — Gemini Flash generation, Mermaid rendering, zoom/pan canvas, code navigation. The core rendering exists; this is mainly a UX restructuring. |
| **Effort** | **Small-Medium.** The Mermaid rendering and code navigation are built. The work is: multi-diagram accumulation, chat→whiteboard routing, and persistence. |

---

## Infrastructure Gaps

### I1 — Session Parser (NEW)

Nothing in current Theia touches Claude Code JSONL files. This is entirely new:

- Parse JSONL from `~/.claude/projects/[folder]/[uuid].jsonl`
- Extract: user messages, AI responses, tool calls (View, Bash, GrepTool, etc.), tool results, thinking traces, diffs
- Correlate: which prompt led to which file changes, which files were read vs. not read
- Output: a structured session object that F2 (Hierarchical Context) and F4 (Chat) consume

**Effort: Medium.** The format is well-documented. The parsing is straightforward JSON processing. The correlation (prompt → resulting changes) requires heuristics or an LLM pass.

### I2 — Prompt→Requirements (NEW, HIGHEST RISK)

Parse freeform prompts into discrete, verifiable requirements. Map each to code sections.

- Input: extracted prompts from I1
- Processing: LLM call to decompose prompts into checklist items
- Mapping: match each requirement to files/functions changed (using file names mentioned in prompts + diff analysis)
- Output: requirements checklist with code section links and verification state

**Effort: Medium, but high uncertainty.** The LLM call is easy. The accuracy is the question — how often does it produce the right checklist? Needs iteration.

### I3 — Risk Scoring (NEW)

Auto-flag high-risk sections. Inputs: AST complexity metrics, file paths matching patterns (auth/state/data), test coverage data, files-not-read from session parser.

**Effort: Small.** Heuristic scoring with well-known inputs. Can start rule-based and get smarter later.

---

## Build Order

The goal: **shortest path to a working review workflow** that's meaningfully better than scanning a diff.

### Phase 0 — Foundation (1-2 weeks)
**Build I1 (Session Parser) + data model for verification state.**

Everything depends on having session data parsed and a shared state model for review progress. Without I1, there's no generation session to surface. Without the verification state model, F1/F3 can't track progress.

Deliverable: Given a JSONL file path, produce a structured session object. Define the TypeScript types for review units, verification states, and requirements.

### Phase 1 — Core Review Loop (2-3 weeks)
**Build F3 (Checkpoints) + F4 (Chat) + I2 (Prompt→Requirements).**

Why these first? F3 extends existing Markers/Labels — it's the fastest path to a *usable* review workflow. F4 extends existing Chat — add session context + persistence. I2 is the biggest risk and needs to start early to iterate on accuracy.

Together, these three give you: open a PR → see extracted requirements → review code with section-level checkmarks and comments → ask the AI questions with full session context → get an aggregated report at the end. That's already a complete workflow, even without the map or hierarchical context.

Deliverable: A reviewable PR with requirements checklist, section markers, inline comments, context-aware chat with persistence, and an exportable report.

### Phase 2 — Navigation & Context (2-3 weeks)
**Build F1 (Review Map) + F2 (Hierarchical Context).**

These are the "wow" features but they depend on Phase 0 and 1 data. The review map needs the dependency graph + verification state. The hierarchical context needs the session parser + AST analysis + the prompt→file mapping from I2.

Deliverable: The full PRD layout — map on the left, diff in the center, hierarchical context on the right.

### Phase 3 — Whiteboard & Polish (1-2 weeks)
**Build F5 (Whiteboard) + I3 (Risk Scoring) + report polish.**

F5 is the lowest-dependency feature — it extends existing diagram infrastructure and connects to chat. Risk scoring adds color to the review map and context hierarchy. Report generation gets polished with all the data now available.

Deliverable: Complete Theia Review as spec'd in the lean PRD.

---

## Risk Summary

| Risk | Impact | Mitigation |
|------|--------|------------|
| I2 accuracy (prompt→requirements) | High — structured workflow depends on it | Prototype early (Phase 1), allow manual editing of extracted requirements |
| JSONL format instability | Medium — parser breaks on Claude Code updates | Abstract the parser behind a schema; version-detect on load |
| Review map complexity | Medium — graph layout for code dependencies is hard | Start with a simple tree (not DAG), upgrade layout later |
| Diagram→Code nav reliability | Known issue — DOM injection is fragile | Already identified in tech brief; fix as part of F5 using state-driven nav |
| Performance on large PRs | Medium — 100+ files with session data is heavy | Lazy-load review units; only parse session data for visible sections |

---

*Maps lean PRD v2.0 features to existing Theia architecture. See theia-review-prd-lean.md for feature definitions and theia-review-prd.md for research rationale.*
