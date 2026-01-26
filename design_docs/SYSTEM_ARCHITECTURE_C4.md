# TH-ARC-01: System Architecture & C4 Model

## 1. MISSION STATEMENT
The architecture of **Theia** is designed for **Observable Autonomy**. It utilizes an Event-Driven, Director-Actor model to bridge the gap between human intent (Voice/Text) and machine execution (Sandbox).

---

## 2. C4 MODEL: LEVEL 1 (System Context)
Theia acts as an intelligent intermediary between the Developer and the project ecosystem.

```mermaid
C4Context
    title System Context Diagram for Theia (Level 1)
    
    Person(user, "Developer", "Senior Engineer / Reviewer")
    System(theia, "Theia", "Spec-Driven Code Review Assistant")
    
    System_Ext(gemini, "Gemini 3 Pro API", "Cognitive Engine (Reasoning & Planning)")
    System_Ext(googleTTS, "Google Cloud TTS", "High-fidelity Voice Synthesis")
    System_Ext(github, "GitHub API", "Source Control & PR Data")
    System_Ext(linear, "Linear API", "Requirements & Issue Tracking")

    Rel(user, theia, "Interacts via Voice, Chat, and Diagrams")
    Rel(theia, gemini, "Sends prompts & tool declarations", "JSON/REST")
    Rel(theia, github, "Fetches PR diffs and Repo contents", "REST/GraphQL")
    Rel(theia, linear, "Fetches issue descriptions", "GraphQL")
    Rel(theia, googleTTS, "Synthesizes voice track", "REST")
    Rel(theia, user, "Navigates code, speaks, and renders diagrams")
```

---

## 3. C4 MODEL: LEVEL 2 (Container Diagram)
The system is divided into three primary execution domains within the browser workstation.

```mermaid
C4Container
    title Container Diagram for Theia (Level 2)

    Person(user, "Developer")

    Container_Boundary(workstation, "Browser Workstation") {
        Container(ui, "UI Layer (React/Vite)", "TypeScript, Tailwind", "Renders Editor, Diagrams, and Chat")
        Container(agent, "Control Plane (LangGraph)", "LangChain, EventBus", "Orchestrates reasoning loops and tool execution")
        Container(sandbox, "Runtime Sandbox (WebContainers)", "StackBlitz WebContainers", "Executes Node.js, Shell, and Tests")
        Container(observability, "Black Box (Observability)", "Ring Buffer, FlightRecorder", "Traces all events and agent states")
    }

    Rel(user, ui, "Speaks/Types/Clicks")
    Rel(ui, agent, "Emits USER_MESSAGE / UI_INTERACTION", "EventBus")
    Rel(agent, ui, "Emits AGENT_SPEAK / AGENT_NAVIGATE", "EventBus")
    Rel(agent, sandbox, "Emits AGENT_EXEC_CMD", "EventBus")
    Rel(sandbox, agent, "Emits RUNTIME_OUTPUT", "EventBus")
    
    UpdateRelTag("EventBus", $textColor="blue", $lineColor="blue")
```

---

## 4. C4 MODEL: LEVEL 3 (Component Diagram - Core Module)
The "Nervous System" and "Brain" components that drive the logic.

```mermaid
C4Component
    title Component Diagram (Core Module - Level 3)

    Component(eb, "EventBus", "Singleton", "Central dispatcher for TheiaEvent union types")
    Component(agent_core, "TheiaAgent", "LangGraph", "Planner-Executor State Machine")
    Component(trace, "TraceService", "Observer", "Correlates events with Agent state snapshots")
    Component(recorder, "LocalFlightRecorder", "Persistence", "Ring buffer persisted to LocalStorage")
    Component(atomizer, "AtomizerService", "LLM Utility", "Decomposes raw specs into atomic SpecAtoms")

    Rel(eb, agent_core, "Subscribes to USER_MESSAGE")
    Rel(agent_core, eb, "Emits AGENT_ACTIONS (Speak, Navigate, etc.)")
    Rel(eb, trace, "Wildcard subscription (*)")
    Rel(trace, agent_core, "Polls getState()")
    Rel(trace, recorder, "Writes TraceEntry")
    Rel(atomizer, eb, "Emits SPEC_ATOMIZED")
```

---

## 5. DYNAMIC MODELS: SEQUENCE DIAGRAMS

### 5.1 The Voice-Command Loop (The "Neural Loop")
How a spoken command manifests as code execution and voice response.

```mermaid
sequenceDiagram
    participant U as User
    participant V as VoiceService
    participant EB as EventBus
    participant A as TheiaAgent
    participant W as WebContainer
    participant G as Gemini API

    U->>V: Speaks "Run tests"
    V->>EB: emit(USER_MESSAGE, mode='voice')
    EB->>A: handle(USER_MESSAGE)
    
    Note over A: Planner Node Active
    A->>G: generateContent(SystemPrompt + Goal)
    G-->>A: submit_plan( [run_terminal_command("npm test")] )
    
    Note over A: Executor Node Active
    A->>EB: emit(AGENT_EXEC_CMD, "npm test")
    EB->>W: execute("npm test")
    W-->>EB: emit(RUNTIME_OUTPUT, "Pass: 42")
    W-->>EB: emit(RUNTIME_EXIT, 0)
    
    Note over A: Response Synthesis
    A->>EB: emit(AGENT_SPEAK, {voice: "Tests passed", screen: "Pass: 42"})
    EB->>V: handle(AGENT_SPEAK)
    V->>U: Plays Audio "Tests passed"
```

### 5.2 Spec-Driven Verification Flow (Phase 7)
Grounding the agent in requirements.

```mermaid
sequenceDiagram
    participant SC as SpecContext
    participant AT as AtomizerService
    participant G as Gemini 3 Pro
    participant DS as DirectorService

    SC->>AT: atomize(raw_markdown)
    AT->>G: "Decompose requirements into JSON"
    G-->>AT: [REQ-1, REQ-2, REQ-3]
    AT-->>SC: setAtoms(SpecAtom[])
    
    Note right of SC: User opens auth.ts
    
    SC->>DS: generatePrecisionResponse(atoms + auth.ts)
    DS-->>SC: "Violation: REQ-2 (MFA) is missing"
```

---

## 6. STATE MACHINE: AGENT COGNITION
The `TheiaAgent` uses a recursive state machine for self-correction and human-in-the-loop gating.

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    state "Cognition Loop" as Loop {
        Idle --> Planner: USER_MESSAGE
        Planner --> Executor: Plan Generated
        
        state Executor {
            [*] --> Gatekeeper
            Gatekeeper --> RequestApproval: Sensitive Tool
            RequestApproval --> Exec: Approved
            RequestApproval --> Fail: Rejected
            
            Exec --> ResultCaptured
            ResultCaptured --> Success: exitCode == 0
            ResultCaptured --> Fail: exitCode != 0
        }
        
        Success --> Synthesis
        Fail --> Planner: REPAIR_MODE (Self-Correction)
    }
    
    Synthesis --> Idle
    
    state RequestApproval {
        [*] --> ModalVisible
        ModalVisible --> [*]: User Click
    }
```

---

## 7. BLOCK DIAGRAM: MODULE DEPENDENCIES
Illustrates the "Operation Glass Box" architecture.

```mermaid
graph LR
    subgraph Core
        EB[EventBus]
        AG[Agent]
        TS[TraceService]
        FR[FlightRecorder]
    end

    subgraph Runtime
        WCS[WebContainerService]
        TU[ToolUtils]
    end

    subgraph Voice
        TTS[TTSService]
    end

    %% Dependencies
    AG --> EB
    WCS --> EB
    TS --> EB
    TS --> AG
    TS --> FR
    AG --> TU
    
    %% Storage
    AG -.-> LS[(LocalStorage)]
    FR -.-> LS
```

---

## 8. DEPLOYMENT ARCHITECTURE
Theia is **Local-First** but relies on high-intelligence cloud primitives.

```mermaid
deployment
    title Deployment Architecture

    node "User Browser" {
        artifact "Vite Bundle" <<UI / Agent>>
        node "Worker Thread" {
            artifact "WebContainer Process"
        }
        database "IndexedDB / LocalStorage" <<Persistence>>
    }

    node "Google Cloud" {
        service "Gemini 3 Pro"
        service "Text-to-Speech API"
    }

    node "GitHub" {
        service "GitHub REST/GraphQL"
    }

    node "Linear" {
        service "Linear GraphQL"
    }
```

---
**Status:** ARCHITECTURE DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-ARC-01
