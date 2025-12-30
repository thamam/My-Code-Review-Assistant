# Retroactive PRD: Theia (v0.3.0)
> *Goal: Explain the product vision so we don't lose the "Soul".*

## Product Vision
**Voice-First, Spec-Driven L4 Autonomy.**

## Target Audience
**Senior Engineers who hate clicking.**

## Core Capabilities (The "Big 3")
1.  **Spec-Driven Traceability:** Verifying code against "Atoms" (Requirements).
2.  **Visual Navigation:** Diagrams as clickable maps.
3.  **Full Repo Exploration:** Lazy-loading the entire territory.

## Non-Functional Requirements
*   **Local-first:** No code leaves the machine (except snippets to LLM).
*   **Low-latency Voice:** < 2s turn-around time.
*   **Privacy:** Usage of local vector stores.

## Success Metrics
1.  **Traceability:** % of code covered by Linear tickets (Target: >80%).
2.  **Voice Utility:** % of sessions using >5 voice commands.
3.  **Discovery:** Avg. time to find a file using Diagrams vs. File Tree (Target: -30%).

## Constraints
*   **Gemini Context Window:** Can't fit entire repo; must use Lazy Loading.
*   **Browser Audio:** Requires HTTPS or localhost context for microphone access.

