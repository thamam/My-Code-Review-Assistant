# Theia Review — Lean PRD

[Version: 2.0 | 2026-03-05]

**Version History:**
- v2.0 (2026-03-05): Rewritten around 5 core reviewer-facing features; trimmed absorbed items
- v1.0 (2026-03-05): Initial version from research synthesis

---

## The Problem

Solo dev uses Claude Code → gets clean-looking code → rubber-stamps it → ships bugs. AI code has 1.7× more issues and 75% more logic errors than human code, but its surface quality triggers approval bias. No tool exists for **one person verifying their own AI's output** with access to the full generation session.

## The Bet

Combine three data sources no tool integrates today:
1. **The diff** (what changed)
2. **The generation session** (why it changed — prompts, reasoning, files read/not read)
3. **The project rules** (CLAUDE.md, linting, dependency rules)

Guide the developer through structured review instead of presenting an open diff.

---

## Design Principles

| # | Principle | Why |
|---|-----------|-----|
| P1 | **Structure defeats bias** | Checklists improve defect detection by 66.7% |
| P2 | **Surface the process, not just the output** | Session data is the unique asset |
| P3 | **Respect cognitive limits** | Detection plummets beyond 400 LOC / 60 min |
| P4 | **AI reviews AI, human verifies** | Adversarial perspective on the generating AI |
| P5 | **Progressive trust, not binary approval** | Multiple signals build confidence |

---

## User Flow

**① Ingest** → Parse JSONL session + git diff + CLAUDE.md → structured review session

**② Orient** → Session summary, requirements checklist, scope overview, risk heatmap

**③ Navigate & Review** → Traverse the review map, read hierarchical context, verify sections, leave comments

**④ Investigate** → Chat with AI partner, generate diagrams on the whiteboard

**⑤ Finalize** → Aggregated report from comments + coverage + trust score → Approve / Request Changes / Re-generate

---

## Core Features

### F1 — Review Map
**An interactive, visual map of the entire changeset that the reviewer traverses.**

Not a file list — a logical structure showing how changes relate: which feature they belong to, what depends on what, and what the reviewer has/hasn't covered. Think navigation graph, not sidebar.

- Dependency-aware layout (foundational code first, dependents after)
- Nodes represent logical review units (≤400 LOC each)
- Visual state per node: ⬜ unreviewed → 🔍 inspected → ✅ verified / ⚠️ flagged
- Progress visible at a glance — the map *is* the dashboard
- Clickable: selecting a node opens the diff + context for that unit

*Absorbs old F4 (dependency ordering) and F7 (dashboard) — the map serves both purposes.*

### F2 — Hierarchical Context
**Every change is explained through a collapsible narrative hierarchy: PR → feature → file → function → line.**

A line of code that checks `userId != null` shouldn't need a paragraph. But the reviewer should be able to trace upward: *this validation is part of the auth check → which is part of the new CLI authentication feature → which was requested in prompt #2*. Context is inherited, not repeated.

- Top level: PR story — what was asked, what was produced, how many iterations
- Mid level: per-feature or per-file — the prompt that triggered it, AI reasoning, CLAUDE.md rules
- Leaf level: per-function/block — specific decisions, files read/not-read
- Breadcrumb trail always visible so the reviewer knows where they are in the hierarchy
- Expandable: click to see more context, collapse to focus on code

*Replaces old F5 (flat context pane) with a structured, navigable context tree.*

### F3 — Review Checkpoints & Aggregated Report
**Section-level verification markers + inline comments that compile into a final review report.**

The reviewer marks sections as they go and drops comments anywhere. At the end, all of it rolls up into a structured document — not just a coverage percentage.

- 5-state markers on logical code blocks: ⬜ Unreviewed, 🔍 Inspected, ✅ Verified, ⚠️ Flagged, 🤖 AI-verified
- Inline free-text comments attached to any line, block, or section
- Comments can be tagged: question, concern, suggestion, note
- **Aggregated report** at review end: all comments organized by file/section, verification coverage, open flags, requirements coverage, trust score
- Report is exportable (markdown/JSON) for commit messages, PR descriptions, or CI integration

*Extends old F3 (checkmarks only) with comments and report generation.*

### F4 — Context-Aware Chat with PR Memory
**A chat partner that knows the PR, the open file, the selected lines, the map status — and remembers across sessions.**

Not a generic AI chat. This partner has the full generation session, sees what you're looking at right now, knows what you've already reviewed, and remembers what you asked yesterday.

- Context injected automatically: PR metadata, current file/lines, map progress, requirements status
- Full generation session access: can reference prompts, reasoning traces, tool calls, files read/not-read
- Adversarial framing: positioned as the generating AI's critic, not its defender
- Key interactions: "why this approach?", "what wasn't considered?", "challenge this section", "does this match the prompt?"
- **Persistent per-PR memory**: questions asked, answers given, and insights discovered persist across multiple review sessions for the same PR by the same user
- Memory stored locally, keyed by PR ID + user

*Expands old F6 (single-session AI partner) with line-level context awareness and cross-session persistence.*

### F5 — Whiteboard
**An on-demand diagram scratchpad tied to the chat — ask a question, get a visual answer.**

When the reviewer asks "how does data flow from the API endpoint to the database?" the response isn't just text — it's a generated diagram on the whiteboard. Diagrams accumulate per session and can be referenced later.

- Generates Mermaid or ASCII diagrams in response to reviewer questions
- Diagrams appear in a dedicated whiteboard panel (not inline in chat)
- Multiple diagrams persist during the session — scrollable/selectable
- Diagram elements are clickable → navigate to corresponding code in the diff
- Can also be triggered manually: "draw the auth flow", "show me the dependency graph for this module"
- Whiteboard state persists with the PR review session

*New feature. Distinct from old F11 (auto-generated sequence diagrams) — this is user-driven and interactive.*

---

## Infrastructure (supports all core features)

| ID | Component | Purpose |
|----|-----------|---------|
| I1 | **Session Parser** | Ingest Claude Code JSONL → extract prompts, reasoning, tool calls, diffs, errors |
| I2 | **Prompt→Requirements** | Parse freeform prompts into verifiable checklist, map to code sections |
| I3 | **Risk Scoring** | Auto-flag sections touching auth/state/data, missing tests, high complexity |

**I2 is the biggest risk.** The structured workflow depends on reliably parsing freeform prompts into discrete checkable items. Prototype this first.

---

## Later (v1.1+)

| Feature | One-liner |
|---------|-----------|
| Enriched Diff | Distinguish move/update/copy-paste (~30% noise reduction) |
| Architectural Validation | dependency-cruiser violations inline in diff |
| Stacked Review Units | Auto-break >400 LOC into dependency-ordered stacks |
| Defect Learning | Track flagged patterns → predict "likely problematic" sections |
| Cross-Session Patterns | Recurring prompt misunderstandings, missed files across sessions |
| Voice Review | Hands-free review via Theia's Live Voice API |

---

## Key Screen Layout

```
┌──────────────┬──────────────────────┬───────────────┐
│              │                      │               │
│  REVIEW MAP  │   CODE DIFF          │  HIERARCHICAL │
│  (interactive│   (section-level     │  CONTEXT      │
│   graph with │    markers +         │  (collapsible │
│   progress)  │    inline comments)  │   PR→feature  │
│              │                      │   →func→line) │
│              │                      │               │
├──────────────┴──────────┬───────────┴───────────────┤
│                         │                           │
│  💬 CHAT                │  🎨 WHITEBOARD            │
│  (context-aware,        │  (on-demand diagrams,     │
│   persistent per-PR)    │   clickable elements)     │
│                         │                           │
├─────────────────────────┴───────────────────────────┤
│  📋 Requirements: 2/5 verified  │  Trust: 34%      │
└─────────────────────────────────────────────────────┘
```

---

## Open Questions

1. How stable is the JSONL format across Claude Code versions?
2. What's the right "section" granularity — function? block? AST node?
3. Standalone app vs. VS Code extension vs. Theia web extension?
4. How should the review map layout algorithm work — tree? DAG? force-directed?
5. What's the storage/sync model for per-PR chat memory?

---

*Condensed from full PRD (theia-review-prd.md) — see that document for research citations and detailed rationale.*
