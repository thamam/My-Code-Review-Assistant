# HANDOVER v0.4.0 — "The Neural Update"

> **Session Sealed:** 2026-01-02  
> **Status:** Stable Release  
> **Codename:** Neural Loop

---

## Executive Summary

v0.4.0 introduces the **Event-Driven Control Plane**, completing the architectural refactor that decouples all major subsystems through a central EventBus. The Agent can now see, think, and act autonomously.

---

## Architecture State

```
┌─────────────────────────────────────────────────────────────┐
│                     THEIA v0.4.0                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   modules/   │    │   modules/   │    │   contexts/  │  │
│  │  navigation  │    │     core     │    │  (UI Layer)  │  │
│  │              │    │              │    │              │  │
│  │ • FileTree   │    │ • EventBus   │    │ • PRContext  │  │
│  │ • LazyLoad   │    │ • Agent      │    │ • ChatContext│  │
│  │ • RepoTree   │    │ • Types      │    │ • LiveContext│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │          │
│         └───────────────────┼───────────────────┘          │
│                             │                              │
│                    ┌────────▼────────┐                     │
│                    │    EventBus     │                     │
│                    │  (Singleton)    │                     │
│                    └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Fully Decoupled Modules

| Module | Purpose | Coupling |
|--------|---------|----------|
| `modules/navigation` | File tree, lazy loading, repo access | Zero LLM dependency |
| `modules/core` | EventBus, Agent, Protocol types | Zero UI dependency |
| `contexts/*` | React state, UI rendering | Zero LLM logic |

---

## What Was Implemented (Phase 10)

### Phase 10.1: The Nervous System
- Created `EventBus.ts` with ring buffer (100 events)
- Defined `types.ts` protocol (UserIntent / AgentAction)

### Phase 10.2: Brain Transplant
- Migrated LLM logic from ChatContext to `Agent.ts`
- Implemented LangGraph state machine (single reasoning node)

### Phase 10.3: The Hands
- Wired tool execution through EventBus
- Agent emits `AGENT_NAVIGATE`, `AGENT_TAB_SWITCH`, `AGENT_DIFF_MODE`
- ChatContext blindly executes commands

### Phase 10.4: System Verification
- Created `neural-loop.spec.ts` integration test suite
- Exposed `__THEIA_EVENT_BUS__` and `__THEIA_PR_STATE__` for testing
- **21/21 tests passed** across 3 browsers

---

## Verification Evidence

```
$ npx playwright test tests/neural-loop.spec.ts

Running 21 tests using 7 workers
  21 passed (14.0s)
```

**Test Coverage:**
- EventBus exposure ✓
- AGENT_NAVIGATE → navigateToCode() ✓
- AGENT_TAB_SWITCH → setLeftTab() ✓
- AGENT_DIFF_MODE → setIsDiffMode() ✓
- Event history (Black Box) ✓
- USER_MESSAGE propagation ✓
- AGENT_SPEAK → chat render ✓

---

## Key Files Changed

| File | Change |
|------|--------|
| `src/modules/core/EventBus.ts` | Created - Central pub/sub |
| `src/modules/core/Agent.ts` | Created - LangGraph state machine |
| `src/modules/core/types.ts` | Created - Protocol definitions |
| `contexts/ChatContext.tsx` | Refactored - Dumb Terminal pattern |
| `contexts/PRContext.tsx` | Added - State exposure for tests |
| `tests/neural-loop.spec.ts` | Created - 7 integration tests |
| `docs/architecture/06_EVENT_DRIVEN_CORE.md` | Created - Architecture docs |

---

## Next Target: Phase 11

### The Runtime Sandbox

The Agent has eyes (context), a brain (LLM), and hands (tools). It lacks **legs** — the ability to execute code in a safe environment.

**Objective:** Integrate WebContainers or similar runtime to enable:
- `npm install` execution
- Test running
- Build verification
- REPL interactions

**Blocked On:** Architecture decision for sandbox isolation.

---

## Git State

```
Branch: dev
Tag: v0.4.0-neural-loop
Commit: feat: implement event-driven control plane (v0.4.0)
```

---

## Session Closed

**Status:** Ready for Phase 11 - Runtime Sandbox.

The Neural Loop is verified. The Agent is awake.
