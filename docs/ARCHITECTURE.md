# Architecture: Theia (v0.3.0)
> *Goal: The technical blueprint.*

## System Context
```mermaid
graph LR
    User((User)) <--> VoiceUI[Voice/UI]
    VoiceUI <--> Director[Director (Gemini 3)]
    Director <--> Actor[Actor (TTS)]
```

## Key Patterns
*   **Director/Actor:** The Brain (JSON) vs. The Voice (Audio).
*   **Hexagonal Spec Engine:** Adapters (Linear/File) -> Atomizer -> Context.
*   **The Lazy Graph:** Hybrid State (`prFiles` + `repoTree`) for handling large repos.

## Tech Stack
*   **Frontend:** React, Vite, Tailwind
*   **AI:** Gemini 3 Pro
*   **Voice:** Google Cloud TTS
