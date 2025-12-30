# 02. Director & Actor Engine (L2)
> *The Brain & Voice: Dual-Track Intelligence*

## Core Concept: The Dual-Track Response
To prevent the AI from reading 50 lines of code aloud, we split the response into two tracks:
1.  **Voice Track:** Natural language summary (Audio).
2.  **Screen Track:** Executable commands or Markdown text (Visual).

## Source of Truth
*   `src/contexts/LiveContext.tsx`: The session manager (WebSockets/STT).
*   `src/services/DirectorService.ts`: The prompt engineer and JSON parser.

## The Pipeline (`handleSpeechResult`)

```mermaid
sequenceDiagram
    participant User
    participant LiveContext
    participant Director as DirectorService
    participant Gemini as Gemini API
    participant Actor as TTSService

    User->>LiveContext: "Verify this function." (Audio/Text)
    
    rect rgb(20, 20, 20)
        note right of LiveContext: Context Gathering
        LiveContext->>LiveContext: Assembly Prompt (File + Spec + History)
    end
    
    LiveContext->>Gemini: Generate Content
    Gemini-->>Director: Raw Text Response
    
    rect rgb(50, 20, 20)
        note right of Director: Parsing
        Director->>Director: JSON.parse(response)
        Director-->>LiveContext: PrecisionResponse { voice, screen }
    end
    
    par Parallel Output
        LiveContext->>Actor: speak(response.voice)
        Actor->>User: 🔊 Audio Stream
    and
        LiveContext->>LiveContext: upsertMessage(response.screen)
        LiveContext->>User: 👁️ Markdown / Highlights
    end
```

## Data Structures

### `PrecisionResponse`
The contract between Director and Client.

```typescript
interface PrecisionResponse {
  /** 
   * The text to be spoken by the TTS engine. 
   * Concise, conversational, no code blocks.
   */
  voice: string;

  /** 
   * The text/action to be displayed.
   * Full Markdown, Code snippets, Syntax highlighting.
   */
  screen: string; 

  /**
   * Optional UI actions to trigger automatically
   */
  action?: {
    type: 'navigate' | 'highlight' | 'diff';
    payload: any;
  };
}
```

### Connection Modes
*   **Live Mode:** Uses Gemini 2.5 Live API (WebSockets). Real-time, interruptible, lower precision.
*   **Precision Mode:** Uses Gemini 3 Pro (REST). Browser STT -> Text -> RAG -> JSON. Higher intelligence.
