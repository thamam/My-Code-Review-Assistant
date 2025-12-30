# 01. System Overview (L1)
> *The Map: High-Level Containers & Loop*

## Container Diagram

```mermaid
flowchart TD
    User((User))
    
    subgraph "Client Workstation"
        subgraph "React App (Vite)"
            UI["Voice/UI Layer"]
            ControlPlane["LangGraph Control Plane"]
            LocalServices["Services (Logic)"]
            EventBus{("Event Bus")}
        end
        
        subgraph "Runtime Sandbox"
            WebContainer["WebContainers (Node.js)"]
        end
        
        BrowserSTT["Browser STT (Speech Rec)"]
        BrowserTTS["Browser Audio Context"]
        
        Observability["Observability Layer (Sidecar)"]
    end
    
    subgraph "Cloud Services"
        DirectorAPI["Gemini 3 Pro API"]
        ActorAPI["Google Cloud TTS API"]
        GitProvider["GitHub API"]
        IssueTracker["Linear API"]
    end

    %% Flow
    User <--> |Speech/Click| UI
    UI <--> EventBus
    EventBus <--> ControlPlane
    ControlPlane --> LocalServices
    ControlPlane --> WebContainer
    
    %% Observability Taps
    EventBus -.-> Observability
    ControlPlane -.-> Observability
    WebContainer -.-> Observability
    
    %% External
    LocalServices <--> DirectorAPI
    LocalServices <--> ActorAPI
    LocalServices <--> GitProvider
    LocalServices <--> IssueTracker
    
    UI <--> BrowserSTT
    BrowserTTS <--> User
```

## Directory Mapping

| Directory | Architectural Role | Key Modules |
| :--- | :--- | :--- |
| `src/contexts` | **The State Machine** | `LangGraph` (Control), `LiveContext` (Events), `SpecContext` (Truth) |
| `src/runtime` | **The Sandbox** | `WebContainerService` (Execution), `Terminal` (IO) |
| `src/services` | **The Engines** | `DirectorService` (Reasoning), `GitHubService` (Data), `Observability` (Tracing) |
| `src/components` | **The Interface** | `SourceView` (Editor), `LinearPanel` (Requirements), `DiagramPanel` (Map) |

## The Core Loop
The system operates on an **Event-Driven Loop**:

1.  **Event:** User Interaction (Voice Command, Click, Selection).
2.  **State Transition:** The `LangGraph Control Plane` receives the event via `EventBus`.
3.  **Context Assembly:** The graph node pulls dynamic context:
    *   *Where am I?* (Active File, Viewport)
    *   *What am I doing?* (Active Spec, History)
4.  **Reasoning:** The `Director` (Gemini) assesses the Event + Context.
5.  **Execution (Sandbox):** If code needs running, it's dispatched to `WebContainers`.
6.  **Response:**
    *   *Voice:* Sent to TTS Service -> Audio.
    *   *Screen:* Updates UI via `LiveContext`.
