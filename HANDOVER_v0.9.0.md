# HANDOVER: v0.9.0 "The Collaborator"

**Release Date:** 2026-01-10  
**Status:** Beta Release (Experimental)  
**Codename:** The Collaborator

---

## 🎯 Release Summary

Version 0.9.0 introduces **Human-in-the-Loop Control**, transforming Theia from an autonomous executor to a supervised co-pilot. The Agent now requests explicit permission before executing sensitive actions.

## ✨ New Features

### Human-in-the-Loop Gatekeeper (Phase 15)

- **The Interceptor**: Executor checks tool sensitivity before execution
- **The Handshake**: Resume mechanism via `USER_APPROVAL` events
- **The Control Panel**: `ApprovalRequest.tsx` modal overlay

### Sensitive Tools List

The following tools require user approval:

| Tool | Description |
|------|-------------|
| `run_terminal_command` | Shell command execution |
| `write_file` | File creation/modification |
| `git_commit` | Version control commits (future) |
| `git_push` | Remote push operations (future) |

### Robust Executor Protocol

- **Try/Catch Safety**: API errors are gracefully handled
- **Timeout Protection**: 30-second timeout prevents infinite hangs
- **Chatty Model Detection**: Fails gracefully if LLM returns text instead of tool call

## 📁 Files Changed

### New Files

| File | Description |
|------|-------------|
| `components/ApprovalRequest.tsx` | Permission modal UI component |
| `docs/architecture/11_HUMAN_IN_THE_LOOP.md` | Architecture documentation |

### Modified Files

| File | Changes |
|------|---------|
| `src/modules/core/Agent.ts` | Gatekeeper logic, `pendingAction` state, `resolvePendingAction()` method |
| `src/modules/core/types.ts` | `AGENT_REQUEST_APPROVAL` and `USER_APPROVAL` events |
| `App.tsx` | Mounted `<ApprovalRequest />` component |

## ⚠️ Known Issues

### Intermittent API Timeouts

The Gemini SDK may occasionally hang during `chat.sendMessage()`, causing the Agent to freeze before the permission modal can appear.

**Workaround:** Hard refresh the browser (Cmd+Shift+R) and retry.

**Mitigation:** Timeout protection ensures the UI eventually recovers (30s max).

### No State Persistence

Pending actions and chat history are lost on page refresh. This is targeted for Phase 16.

## 🧪 Testing

### The Red Button Test

1. Prompt: "Create a file named `security_test.txt` with content 'TOP SECRET'"
2. Expected: `PERMISSION REQUIRED` modal appears
3. Click AUTHORIZE → File is created
4. Click DENY → Agent reports "User blocked" and stops

## 📊 Architecture Progress

| Component | Phase | Status |
|-----------|-------|--------|
| Brain (Planning) | 12 | ✅ Complete |
| Reflexes (Self-Correction) | 13 | ✅ Complete |
| Memory (Librarian) | 14 | ✅ Complete |
| Conscience (Gatekeeper) | 15 | ✅ Complete |
| Persistence | 16 | 🔲 Next |

## 🚀 Next Phase

**Phase 16: The Memory Palace**

Implement session persistence using `localStorage` or `IndexedDB`:
- Save/restore `AgentState` (plan, pending actions)
- Save/restore chat history
- Survive browser refresh

---

*Theia v0.9.0 - The Agent with a Conscience*
