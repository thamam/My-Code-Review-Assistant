# Handover Document: v0.5.0 "The Sandbox Update"

> Session Closed: 2026-01-04 | Phase 11 Complete

---

## Release Status

| Metric | Value |
|--------|-------|
| **Version** | v0.5.0-sandbox |
| **Status** | ✅ Stable Release |
| **Branch** | dev |
| **Commit** | `feat: implement file system bridge (v0.5.0)` |

---

## What's New in v0.5.0

### 🚀 Runtime Sandbox (Phase 11)

The Agent now has **"Legs"** - a browser-native Node.js environment:

| Capability | Implementation |
|------------|----------------|
| **Command Execution** | WebContainer with Node v20 |
| **Terminal UI** | XTerm.js with streaming output |
| **Auto-Mounting** | `SYSTEM_FILE_SYNC` bridge |
| **Security** | `credentialless` COEP isolation |

### File System Bridge (Phase 11.5)

Reactive sync between Navigation (Eyes) and Runtime (Legs):

```
User clicks file → NavigationService fetches → EventBus broadcasts → WebContainer mounts
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        THEIA v0.5.0                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │    Eyes     │    │   Nervous   │    │        Legs         │  │
│  │ Navigation  │───▶│   System    │───▶│  WebContainer       │  │
│  │   Service   │    │  EventBus   │    │  (Node v20 + VFS)   │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│         │                  │                      │              │
│         ▼                  ▼                      ▼              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   GitHub    │    │   Agent     │    │    Terminal UI      │  │
│  │     API     │    │  LangGraph  │    │     (XTerm.js)      │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| Module | File | Purpose |
|--------|------|---------|
| **Types** | `src/modules/core/types.ts` | Event protocol definitions |
| **EventBus** | `src/modules/core/EventBus.ts` | Pub/sub nervous system |
| **Agent** | `src/modules/core/Agent.ts` | LangGraph state machine |
| **Runtime** | `src/modules/runtime/WebContainerService.ts` | Sandbox execution |
| **Terminal** | `src/modules/runtime/TerminalUI.tsx` | XTerm.js interface |
| **Navigation** | `src/modules/navigation/NavigationService.ts` | GitHub file fetching |

---

## Event Protocol

### New in v0.5.0

| Event | Payload | Direction |
|-------|---------|-----------|
| `AGENT_EXEC_CMD` | `{ command, args }` | Agent → Runtime |
| `RUNTIME_OUTPUT` | `{ stream, data }` | Runtime → UI |
| `RUNTIME_EXIT` | `{ exitCode }` | Runtime → Agent |
| `RUNTIME_READY` | `{ url }` | Runtime → System |
| `SYSTEM_FILE_SYNC` | `{ path, content }` | Navigation → Runtime |

---

## Known Issues

### Active Workarounds

| Issue | Workaround |
|-------|------------|
| **AsyncLocalStorage** | Polyfill in `src/polyfills/async-local-storage.ts` |
| **LangGraph Browser** | Patched via polyfill + Vite alias |
| **TypeScript Errors** | Agent.ts has pre-existing type issues (functional at runtime) |

### Not Yet Implemented

| Feature | Status |
|---------|--------|
| Multi-step planning | Phase 12 |
| Persistent file sync | Files re-mount on navigation |
| npm install caching | Each session starts fresh |

---

## Verification Checklist

- [x] WebContainer boots successfully
- [x] Terminal receives RUNTIME_OUTPUT events
- [x] Agent tool `run_terminal_command` executes
- [x] SYSTEM_FILE_SYNC mounts files to VFS
- [x] `ls -la` shows mounted files

---

## Next Phase: The Planner (Phase 12)

**Objective:** Multi-step autonomous planning

The Agent can now:
- ✅ **See** (Navigation + GitHub)
- ✅ **Think** (LangGraph + Gemini)
- ✅ **Act** (Tools + EventBus)
- ✅ **Run** (WebContainer)

**Missing:** Complex task decomposition and execution tracking.

---

## Session Instruction

```
Session Closed. Ready for Phase 12: The Planner.
```
