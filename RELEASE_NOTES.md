# Theia v1.2 — Fusion (Beta)

**Version:** v1.2
**Status:** Beta
**Date:** 2026-08-08
**Known Issues:** QA-001 (P1 — planner JSON leaking into chat) remains open in Agent mode; the new default Simple Mode bypasses it rather than fixing it.

## 🚀 Release Overview
This release merges five phases of work from the sibling fork back into the main line. The headline change is a simpler default experience: plain streaming chat is now the standard path for PR review, with the full agent loop available as an explicit opt-in.

---

## 🆕 New

- **Simple Mode (default)** — Plain streaming chat is now the default for PR review: faster and cheaper, with Google Search grounding and source-citation chips. The full agent loop (navigation, terminal, file edits with approval) is an explicit opt-in via the header toggle.
- **Review-intent modes** — PR Review / Learn Code Base / Code Dive / Custom Focus mode cards shape the AI's focus in both chat and voice.
- **Structure diagrams** — Class / state / flowchart generation joins sequence diagrams, with clickable code references.
- **Proactive voice Brain** — During live voice sessions, opening a file triggers a background analysis whispered to the voice agent.
- **Per-PR persistence** — Diagrams and chat history survive reloads, keyed per PR.

## 🐛 Fixed

- **Chat context regression** — The chat AI sees file contents again (a regression had reduced its context to file paths/line numbers only).
- **Model selector** — Actually selects models now (was dead UI). Current roster: Gemini 3.1 Pro (thinking), Gemini 3 Flash, Gemini 2.5 Flash Lite.
- **Diagram-to-code clicks** — Deterministic reference IDs and explicit label binding replace index-guessing; persisted diagrams re-resolve paths.
- **Code navigation** — Registration-based handshake replaces three polling timers; one highlight; deleted lines are now annotatable and navigable; navigation falls back gracefully instead of silently failing.
- **Partial fetch failures** — One unfetchable file (e.g. a >1MB lockfile) no longer fails the whole PR load; failed fetches are marked unavailable instead of cached as empty.
- **Credentials** — One resolver (env → saved → session) for GitHub/Linear tokens everywhere. Tokens entered in the UI now reach repo browsing; the token field overrides env for that load.

## 🔀 Changed

- **Sample PR** — Loads through the real ingestion pipeline (its full-repo demo remains, mock-backed).

## 🧹 Internal

- Dead experiment modules removed.
- Repo hygiene: session artifacts and debug scripts pruned; handovers archived to `docs/history/`.
- Prompt assembly centralized.
- Unit tests: 102 → 265.

---

# Theia v1.0 Beta - Release Notes

**Version:** v1.0
**Status:** Beta
**Date:** 2026-01-20
**Known Issues:** One open P1 (QA-001 — planner JSON leaking into chat); one open P2 (ENV-001 — rate limiting).

## 🚀 Launch Overview
We are proud to announce the **v1.0 Beta** of Theia, the Advanced Agentic Coding Assistant. This release is a Beta milestone (see HANDOVER_v1.1.0.md), featuring an autonomous agent capable of self-correction, safe execution, and visual explanation.

---

## ✅ Verified User Stories (Readiness: 100%)

### 1. The Visual Explorer (Story 1)
- **Verified:** Users can generate and interact with architecture diagrams.
- **Readiness:** **10/10**
- **Key Deliverable:** Clickable Mermaid.js diagrams that deep-link to code definitions.

### 2. The Cautious Architect (Story 2)
- **Verified:** Agent successfully intercepts sensitive operations (file writes, deletes) and requests user approval.
- **Readiness:** **10/10**
- **Key Deliverable:** "Permission Required" Modal & Safety Gatekeeper.

### 3. The Deep Diver (Story 3)
- **Verified:** Users can explore "Ghost Files" (not in local state) via lazy-loading from GitHub API.
- **Readiness:** **9/10** (Performance optimized < 2s)
- **Key Deliverable:** Hybrid File Tree (Hot + Ghost Nodes) with caching.

### 4. The Resilience Check (Story 4)
- **Verified:** Agent self-corrects when tools fail (e.g., file not found, bad syntax).
- **Readiness:** **9/10**
- **Key Deliverable:** Self-Healing Planner & Repair Mode loops.

### 5. The Shadow Partner (Story 5)
- **Verified:** Agent tracks user context (cursor, tabs) silently to provide relevant answers without interrupting.
- **Readiness:** **9/10**
- **Key Deliverable:** Live Context Stream & Barge-In Handling.

---

## 🌟 Key Features

### 🧠 Self-Repair Planner
The Agent doesn't just fail; it learns. If a tool execution errors out, the Planner enters **Repair Mode**, analyzing the `lastError` and generating a corrected plan automatically.

### 👻 Ghost Node Navigation
Explore your entire repository without checking it all out. The file tree displays "Ghost Nodes" that fetch content on-demand, caching it locally for instant subsequent access.

### 🛡️ Safety Gatekeeper
Trust, but verify. Critical actions like writing files or running shell commands trigger a **User Approval Workflow**, ensuring the AI never modifies your code without consent.

### 🗺️ Interactive Maps
Ask "Draw the architecture," and get a live, clickable diagram. Click any node to jump straight to the source code.

---

## 🔧 Infrastructure
- **End-to-End Testing:** Full "Hunter-Killer" suite running on Playwright.
- **Performance:** Sub-2s latency for file fetching; optimized context updates.
- **Observability:** Full state dumps and local event tracing via the in-app EventBus, TraceService, and FlightRecorder (no external LangSmith integration).
