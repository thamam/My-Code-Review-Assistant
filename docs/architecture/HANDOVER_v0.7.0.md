# Handover: v0.7.0 "The Refiner"

> **Status**: Beta Release  
> **Branch**: `feature/phase13-self-correction` → `dev`  
> **Date**: 2025-01-07

## Release Summary

Version 0.7.0 introduces **Cognitive Resilience** to the Theia Agent. The Agent can now detect failures during execution, capture error context, and autonomously generate repair plans.

## New Capabilities

### 1. Self-Correction Loop

| Feature | Description |
|---------|-------------|
| **Trauma Capture** | `lastError` field in AgentState stores execution errors |
| **Route Diversion** | Governor detects `plan.status === 'failed'` and reroutes to Planner |
| **Repair Mode** | Planner injects error context to generate fix-oriented plans |
| **Retry Execution** | Executor runs the new repair plan automatically |

### 2. Dynamic Replanning

The LangGraph now has a bidirectional edge:
```
executor → planner  (on failure)
planner → executor  (always)
```

### 3. Error Context Injection

The Planner receives rich error context:
```typescript
systemInstruction += `
  CRITICAL UPDATE: REPAIR MODE
  Failed Step: "${plan.steps[activeIndex]?.description}"
  Error Output: "${lastError}"
`;
```

## Architecture Changes

### Modified Files

| File | Changes |
|------|---------|
| `src/modules/core/Agent.ts` | Added `lastError` to state, repair mode in planner, self-correction routing |

### State Schema Update

```typescript
interface AgentState {
  messages: { role: string; content: string }[];
  context: any;
  prData: any;
  plan?: AgentPlan;
  lastError?: string;  // NEW: Phase 13
}
```

## Verification Evidence

The 429 "Resource Exhausted" error that occurred during testing proved the loop works:

1. ✅ `lastError` was populated with the error
2. ✅ `routePlan` detected `plan.status === 'failed'`
3. ✅ Router returned `"planner"` instead of `END`
4. ✅ Planner generated a new repair plan

## Known Limitations

1. **Single Retry Strategy**: Only one repair attempt before potential re-failure
2. **No Backoff**: Aggressive retry could hit rate limits (as observed)
3. **No Error Classification**: All errors treated equally

## Next Phase: 14 - The Librarian (Context Awareness)

**Problem**: Agent is "amnesic" - only knows open files or explicit mentions.

**Solution**: Implement Semantic Search / RAG:
- Indexer for the Ghost Graph (file tree)
- `search_codebase(query)` tool
- Browser-native vector store (minisearch/orama)

## Quick Reference

```bash
# View the changes
git log --oneline v0.6.0-planner..v0.7.0-refiner

# Run the agent
npm run dev

# Test self-correction
# Trigger a failing command, observe repair plan generation
```

## Files Added

- `docs/architecture/09_SELF_CORRECTION.md`
- `HANDOVER_v0.7.0.md` (this file)

---

*Theia v0.7.0 - The Refiner: Fail, Learn, Adapt.*
