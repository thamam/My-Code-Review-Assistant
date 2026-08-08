# Theia Agent Execution Flow

This diagram visualizes the internal state machine of the Theia Agent, based on the LangGraph implementation in `src/modules/core/Agent.ts`.

```mermaid
stateDiagram-v2
    [*] --> Planner : USER_MESSAGE

    state Planner {
        [*] --> AnalyzeRequest
        AnalyzeRequest --> CheckRepairMode
        CheckRepairMode --> StandardPlanning : No failure
        CheckRepairMode --> RepairPlanning : Failed status
        StandardPlanning --> SubmitPlan
        RepairPlanning --> SubmitPlan : With error context
        SubmitPlan --> [*] : Plan created
    }

    Planner --> Executor : Plan ready

    state Executor {
        [*] --> GetCurrentStep
        GetCurrentStep --> CallLLM
        CallLLM --> CheckToolCall
        
        state CheckToolCall <<choice>>
        CheckToolCall --> Gatekeeper : Tool detected
        CheckToolCall --> MarkFailed : No tool call
        
        state Gatekeeper {
            [*] --> IsSensitive
            IsSensitive --> RequestApproval : Sensitive tool
            IsSensitive --> ExecuteTool : Safe tool
            RequestApproval --> SetPendingAction
            SetPendingAction --> [*] : Emit approval request
        }
        
        ExecuteTool --> AnalyzeResult
        AnalyzeResult --> MarkCompleted : Success
        AnalyzeResult --> MarkFailed : Error
        MarkCompleted --> [*]
        MarkFailed --> [*]
    }

    state Governor <<choice>>
    Executor --> Governor : Route decision

    Governor --> Executor : More steps remain
    Governor --> Planner : Failed - Self Correction
    Governor --> [*] : Completed or Paused

    state "Human in the Loop" as HITL {
        [*] --> WaitingForApproval : Pending action
        WaitingForApproval --> UserDecision : User responds
        UserDecision --> Approved : Approved
        UserDecision --> Rejected : Rejected
        
        Approved --> ExecuteApprovedTool
        ExecuteApprovedTool --> ResumeGraph : Resume execution
        
        Rejected --> MarkStepFailed
        MarkStepFailed --> ResumeGraph : Trigger repair
    }

    note right of Governor
        The Governor routePlan controls
        - Execution loop continuation
        - Self correction routing
        - Safety rail max 15 steps
        - Pending action pause
    end note

    note right of Planner
        Repair Mode Detection
        If plan failed the Planner
        injects error context and
        generates a fix oriented plan
    end note

    note right of HITL
        Sensitive Tools
        - run_terminal_command
        - write_file
        
        These trigger the Gatekeeper
        and pause execution until
        user approval is received
    end note
```

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **StateGraph** | Lines 166-197 | LangGraph state machine with `messages`, `context`, `prData`, `plan`, `lastError`, `pendingAction` channels |
| **Planner Node** | Lines 445-617 | Generates step-by-step plans; enters Repair Mode when `plan.status === 'failed'` |
| **Executor Node** | Lines 623-830 | Executes current step; invokes Gatekeeper for sensitive tools |
| **routePlan** | Lines 224-264 | Conditional edge logic (Governor) - decides loop/repair/end |
| **Gatekeeper** | Lines 728-745 | Intercepts `SENSITIVE_TOOLS`, emits `AGENT_REQUEST_APPROVAL`, sets `pendingAction` |
| **resolvePendingAction** | Lines 311-408 | Handles `USER_APPROVAL` events to resume or abort execution |

## Execution Paths

### Standard Execution
```
USER_MESSAGE → Planner → Executor → [Loop] → Executor → ... → END
```

### Self-Correction (Repair Mode)
```
Executor (step failed) → Governor → Planner (Repair Mode) → Executor → ...
```

### Human-in-the-Loop
```
Executor → Gatekeeper → pendingAction set → END (paused)
    ↓
USER_APPROVAL event → resolvePendingAction() → Re-invoke graph
```
