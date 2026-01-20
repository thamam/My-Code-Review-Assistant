# QA Session Log

**Version:** v1.0.0  
**QA Lead:** [Tomer]  
**Start Date:** 2026-01-14

---

## Session Log

| Date | Session Type | Duration | Outcome |
|------|--------------|----------|---------|
| YYYY-MM-DD | Creator / Maintainer / Adversary | Xm | ✅ Pass / ⚠️ Issues / ❌ Blocked |
| 2026-01-14 | Creator | Xm | ✅ Pass / ⚠️ Issues / ❌ Blocked |
### Session Types

- **Creator:** Happy path testing — build plans, execute commands, validate flows
- **Maintainer:** Persistence & recovery testing — refresh, restore, resume
- **Adversary:** Edge cases & stress testing — malformed input, rapid actions, quota exhaustion

---

## Issue Matrix

| ID | Observation | Suspected Component | Severity | Action |
|----|-------------|---------------------|----------|--------|
| QA-001 | Agent generates JSON in chat but Sidebar remains empty; State dump shows no active plan. | Planner Node / JSON Parser | P1 | Investigate plannerNode regex parsing. |
| ENV-001 | System hit API Rate Limit (429) during multi-step execution. Limit: 10 RPM. | Infrastructure / Gemini API | P2 | Option A: Switch model to gemini-1.5-flash (higher quota).  Option B: Add a delay(5000) between steps. |


### Severity Definitions

| Level | Name | Criteria | Response |
|-------|------|----------|----------|
| **P0** | CRITICAL | System hang, data loss, security breach | IMMEDIATE HOTFIX |
| **P1** | MAJOR | Logic hallucination, bad plan generation | Log for v1.1.0 |
| **P2** | MODERATE | Tool failure, session amnesia | Log for v1.1.0 |
| **P3** | MINOR | UI glitch, slow response | Log for v1.1.0 |

---

## Standard Bug Report Template

### Issue: QA-XXX

**Date:** YYYY-MM-DD HH:MM  
**Reporter:** [Name]  
**Severity:** P0 / P1 / P2 / P3  

#### Description
[One-line summary of the issue]

#### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

#### Expected Behavior
[What should have happened]

#### Actual Behavior
[What actually happened]

#### Suspected Component
- [ ] Agent Core (`Agent.ts`)
- [ ] Event Bus (`EventBus.ts`)
- [ ] Storage Service (`StorageService.ts`)
- [ ] Chat Context (`ChatContext.tsx`)
- [ ] Runtime (`WebContainerService.ts`)
- [ ] UI Component: _________
- [ ] Other: _________

#### Black Box Dump
```json
{
    "timestamp": {
        "savedAt": "2026-01-13T22:05:24.070Z",
        "readAt": "2026-01-13T22:08:02.445Z"
    },
    "plan": {
        "id": null,
        "goal": null,
        "status": "completed",
        "totalSteps": 0,
        "activeStepIndex": null
    },
    "activeStep": null,
    "pendingAction": null,
    "lastError": null,
    "recentHistory": [
        {
            "index": -9,
            "role": "user",
            "preview": "Create a fully functional Pomodoro Timer app. It needs a 25-minute countdown, St..."
        }
    ]
}
```

#### Console Errors
```
// Paste any browser console errors here
```

#### Screenshots / Recording
[Attach if available]

#### Notes
[Additional context, theories, or observations]

---

## Resolved Issues

| ID | Resolution | Resolved In |
|----|------------|-------------|
| QA-XXX | [Summary] | v1.0.X / v1.1.0 |
