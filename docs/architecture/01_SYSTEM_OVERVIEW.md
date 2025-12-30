# 01. System Overview (L1)
> *The Map: High-Level Containers & Loop*

## Container Diagram

```mermaid
graph TD
    User((User))
    
    subgraph "Client Workstation"
        subgraph "React App (Vite)"
            UI[Voice/UI Layer]
            Orchestrator[Orchestrator (Contexts)]
            Services[Services (Logic)]
        end
        
        BrowserSTT[Browser STT (Speech Rec)]
        BrowserTTS[Browser Audio Context]
    end
    
    subgraph "Cloud Services"
        DirectorAPI[Gemini 3 Pro API]
        ActorAPI[Google Cloud TTS API]
        GitProvider[GitHub API]
        IssueTracker[Linear API]
    end

    %% Flow
    User <--> |"Speech/Click"| UI
    UI <--> Orchestrator
    Orchestrator --> Services
    
    Services <--> DirectorAPI
    Services <--> ActorAPI
    Services <--> GitProvider
    Services <--> IssueTracker
    
    UI <--> BrowserSTT
    BrowserTTS <--> User
```

## Directory Mapping

| Directory | Architectural Role | Key Modules |
| :--- | :--- | :--- |
| `src/contexts` | **The State Machine (Orchestrator)** | `PRContext` (Nav), `LiveContext` (AI), `SpecContext` (Truth) |
| `src/services` | **The Engines (Logic)** | `DirectorService` (Reasoning), `GitHubService` (Data), `AtomizerService` (Spec Parsing) |
| `src/components` | **The Interface (View)** | `SourceView` (Editor), `LinearPanel` (Requirements), `DiagramPanel` (Map) |

## The Core Loop
The system operates on an **Event-Driven Loop**:

1.  **Event:** User Interaction (Voice Command, Click, Selection).
2.  **Context Assembly:** The `Orchestrator` gathers the current state:
    *   *Where am I?* (Active File, Viewport)
    *   *What am I doing?* (Active Spec, History)
3.  **Reasoning:** The `Director` (Gemini) assesses the Event + Context.
4.  **Decision:** The Director outputs a JSON Action Plan (`{ voice, screen }`).
5.  **Execution:**
    *   *Voice:* Sent to TTS Service -> Audio.
    *   *Screen:* Dispatched to `LiveContext` -> `PRContext` -> Updates UI.
