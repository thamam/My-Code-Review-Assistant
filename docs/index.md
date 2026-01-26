# Master Index - My-Code-Review-Assistant

Welcome to the **Theia Mission Control** documentation hub. This index serves as the primary entry point for understanding, developing, and maintaining the AI Code Review Assistant.

## Project Overview

- **Type:** Monolith (Web Application)
- **Primary Language:** TypeScript
- **Framework:** React + Vite
- **Architecture:** Event-Driven Director-Actor Model

## Quick Reference

- **Tech Stack:** React, LangGraph, Gemini, WebContainers, Mermaid, Playwright.
- **Entry Point:** `index.tsx`
- **Core Orchestrator:** `src/services/DirectorService.ts`
- **Requirements Source:** [REQUIREMENTS.csv](./specs/REQUIREMENTS.csv)

## Generated Documentation

- [Project Overview](./project-overview.md)
- [System Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)
- [Component Inventory](./component-inventory-root.md)
- [QA Strategy](./process/QA_STRATEGY.md)
- [Decision Records](./DECISION_RECORD.md)

## Deep-Dive Documentation

Detailed exhaustive analysis of specific areas:

- [Documentation & Requirements Deep-Dive](./deep-dive-documentation-requirements.md) - Comprehensive analysis of Documentation, Specs, Core Agent, Runtime, and Voice modules (~17 files, ~1500 LOC) - Generated 2026-01-25

## Requirements & Specifications

- [Functional Requirements](./specs/REQUIREMENTS.csv)
- [User Stories](./specs/USER_STORIES.md)
- [Test Coverage Report](./specs/TEST_COVERAGE.md)
- [Phase 7: Spec-Driven Architecture](./specs/phase7-spec-driven-architecture.md)

## Existing Technical Modules

- [System Overview](./architecture/01_SYSTEM_OVERVIEW.md)
- [Agentic Orchestrator](./architecture/02_AGENTIC_ORCHESTRATOR.md)
- [Runtime Environment](./architecture/03_RUNTIME_ENVIRONMENT.md)
- [Dual-Track Voice Protocol](./architecture/AGENT_FLOW.md)
- [Observability](./architecture/04_OBSERVABILITY.md)

## Getting Started

1.  Read the [Development Guide](./development-guide.md) for setup instructions.
2.  Review the [Architecture](./architecture.md) to understand the event-driven core.
3.  Check [QA_LOG.md](../QA_LOG.md) for current status of features and test results.
