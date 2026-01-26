# System Architecture - My-Code-Review-Assistant

## Executive Summary
"Theia" is an interactive code review assistant designed to bridge the gap between static PR data and active architectural understanding. It utilizes an event-driven React frontend coupled with an AI orchestration layer (LangGraph/Gemini) to provide context-aware reviews, interactive diagrams, and voice-guided walkthroughs.

## Technology Stack
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS.
- **AI Orchestration:** LangGraph (State Machine), Google Gemini 3 Pro/2.0 Flash.
- **Runtime Sandbox:** WebContainer API (executing code in-browser).
- **Diagrams:** Mermaid.js.
- **Testing:** Playwright (E2E), Vitest (Unit), Voice IQ (Custom verification).

## Core Architecture Patterns

### 1. Event-Driven Nervous System
The application uses a combination of React Contexts and a centralized `DirectorService` to manage state. Interaction flows are asynchronous and event-driven:
- **Hot Context:** Real-time files loaded in the environment.
- **Ghost Context:** Files referenced but not yet fetched, lazily loaded on demand (FR-032).

### 2. Director-Actor Model
The `DirectorService` acts as the orchestrator:
- **Director:** High-level planning and reasoning (Gemini 3 Pro).
- **Actor:** Tool execution and voice/screen track generation (Gemini 2.0 Flash).
- **Gatekeeper:** Intercepts sensitive tool calls for user approval (FR-011, FR-012).

### 3. Dual-Track Voice Protocol (FR-038)
To ensure accessibility and clarity, the agent separates output into:
- **Voice Track:** Sanitized natural language for TTS (Web Speech API).
- **Screen Track:** Rich Markdown/Code for UI rendering.

## Key Functional Requirements (from REQUIREMENTS.csv)
- **FR-009 (Repair Mode):** Planner receives error context and generates recovery strategies.
- **FR-031 (Interactive Diagrams):** Mermaid nodes trigger navigation to source code locations.
- **FR-041 (Barge-In):** Agent yields control immediately when user interaction is detected.
- **FR-043 (Repository Mode):** System can initialize with just a Git URL, treating all files as Ghost Nodes.

## Security & Performance (NFRs)
- **NFR-003:** No destructive actions (e.g., `write_file`) without explicit user consent.
- **NFR-006:** Ghost file lazy-loading latency target < 2s.
- **NFR-008:** TTS sanitization to prevent reading code snippets aloud.

## Data Flow
1. **Fetch:** `github.ts` fetches PR/Repo metadata.
2. **Initialize:** `SpecContext` parses `REQUIREMENTS.csv` into a searchable "Atom" map.
3. **Reason:** User query triggers `DirectorService`.
4. **Act:** Director selects tool → Gatekeeper validates → Runtime executes in WebContainer.
5. **Report:** Result streamed back to UI via Dual-Track protocol.