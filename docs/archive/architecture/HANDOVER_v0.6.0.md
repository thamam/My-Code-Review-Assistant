# HANDOVER v0.6.0 - "The Architect Update"

> **Codename**: Architect  
> **Tag**: `v0.6.0-architect`  
> **Date**: January 6, 2026

---

## 🚀 Headline Features

### 1. Deliberative Planning (Phase 12.2)
The Agent now **thinks before acting**. Instead of immediately executing tool calls, it decomposes user requests into structured, multi-step plans.

```
User: "Run the tests and show me any failures"
Agent: Creates Plan →
  Step 1: Run npm test (run_terminal_command)
  Step 2: Navigate to failing test (navigate_to_code)
```

### 2. Runtime Feedback Loop (Phase 12.4)
The **Observer** pattern closes the loop between command execution and agent awareness. The Agent now waits for terminal commands to complete and captures their output.

- Synchronous `executeCommandAndWait()` 
- Captures `stdout`, `stderr`, and exit codes
- Real-time output streaming via EventBus

### 3. Graceful Failure Handling (Phase 12.5)
The **Judge** analyzes step results and can **abort** execution when things go wrong. No more cascading failures.

- Exit code detection: `[Exit Code: N]`
- Immediate plan abortion on failure
- User notification with failure context

### 4. Safety Rails (Phase 12.6)
The **Governor** enforces a hard 15-step limit to prevent:
- Infinite planning loops
- API credit drain
- Browser resource exhaustion

---

## 📊 Architecture Evolution

```
v0.4.0 (Neural Loop)     v0.5.0 (Runtime)          v0.6.0 (Architect)
━━━━━━━━━━━━━━━━━━━      ━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━
┌─────────────┐          ┌─────────────────┐       ┌──────────────────┐
│  EventBus   │    →     │  WebContainer   │   →   │  Planner Node    │
│  (Nervous   │          │  (Sandbox)      │       │  Executor Node   │
│   System)   │          │                 │       │  Observer/Judge  │
└─────────────┘          └─────────────────┘       │  Governor        │
                                                   └──────────────────┘
```

---

## 🔧 Technical Changes

| File | Change |
|------|--------|
| `src/modules/core/Agent.ts` | Added `plannerNode`, `executorNode`, `routePlan` with Governor |
| `src/modules/core/Agent.ts` | Added `executeCommandAndWait()` for sync terminal feedback |
| `src/modules/planner/types.ts` | New `AgentPlan`, `PlanStep` interfaces |
| `docs/architecture/08_THE_PLANNER.md` | New architecture documentation |

---

## 📋 Event Catalog (New)

| Event | Emitter | Subscriber |
|-------|---------|------------|
| `AGENT_PLAN_CREATED` | Agent (Planner) | ChatContext (UI) |
| `AGENT_EXEC_CMD` | Agent (Executor) | WebContainerService |
| `RUNTIME_OUTPUT` | WebContainerService | Agent (Observer) |
| `RUNTIME_EXIT` | WebContainerService | Agent (Observer) |

---

## ⚠️ Breaking Changes

None. This release is backward-compatible with v0.5.0.

---

## 🧪 Verification

The following scenarios were tested:

1. **Happy Path**: Multi-step plan executes all steps successfully
2. **Failure Path**: Plan aborts when a step fails (e.g., `ls nonexistent`)
3. **Safety Rail**: Plans exceeding 15 steps are terminated by the Governor

---

## 📦 Next Steps (v0.7.0+)

- [ ] **Step Retry**: Allow single-step retry before full abort
- [ ] **Plan Persistence**: Save/restore plans across sessions
- [ ] **Plan UI**: Visual step-by-step progress indicator
- [ ] **Streaming Plans**: Show plan steps as they're generated

---

## 🏷 Release Commands

```bash
git add .
git commit -m "feat: implement safety rails and seal v0.6.0"
git tag v0.6.0-architect
git checkout dev
git merge feature/phase11-runtime-sandbox
git push origin dev --tags
```

---

> "The measure of an agent is not how many steps it can execute, but knowing when to stop."  
> — *Theia v0.6.0*
