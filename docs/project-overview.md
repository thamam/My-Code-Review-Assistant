# Project Overview - My-Code-Review-Assistant

## Project Name and Purpose
**Theia: AI-Powered Code Review Assistant**
Theia is an interactive application designed to transform standard pull request data into an intuitive, visual, and voice-guided experience. It aims to help developers understand complex changes faster through interactive diagrams, context-aware AI chat, and automated walkthroughs.

## Executive Summary
This project implements a sophisticated "Director-Actor" model for AI orchestration. It allows an agent to not only analyze code but also interact with a live runtime environment (via WebContainers) and navigate the UI in sync with its reasoning. The dual-track voice protocol ensures that technical explanations are clear and accessible without cluttering the screen or reading code syntax aloud.

## Tech Stack Summary
| Category | Technology |
| :--- | :--- |
| **Frontend Framework** | React 18 (TypeScript) |
| **Build Tool** | Vite |
| **AI Orchestration** | LangGraph (State Machine) |
| **LLMs** | Google Gemini 3 Pro (Planning), Gemini 2.0 Flash (Execution/Voice) |
| **Styling** | Tailwind CSS |
| **Runtime** | WebContainer API |
| **Visuals** | Mermaid.js (Diagrams) |
| **Testing** | Playwright (E2E), Vitest (Unit) |

## Architecture Type
**Event-Driven Director-Actor Model**
The system is built around a centralized event bus (implemented via React Contexts and a Director Service) that coordinates between UI interactions, AI reasoning, and external service calls (GitHub, Linear).

## Repository Structure
- **Classification:** Monolith
- **Structure:** Single repository containing both the frontend UI and the core AI services.
- **Documentation Hub:** Centralized in the `docs/` folder.

## Key Documentation Links
- [Master Index](./index.md)
- [System Architecture](./architecture.md)
- [Functional Requirements](./specs/REQUIREMENTS.csv)
- [Development Guide](./development-guide.md)
- [QA Strategy](./process/QA_STRATEGY.md)
