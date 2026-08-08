# Product Brief: Theia
> *The Spec-Driven Code Review Agent.*

## Product Description
Theia is an AI-powered code review assistant that bridges the gap between **Requirements (Specs)** and **Implementation (Code)**. Unlike generic chat assistants, Theia is "grounded" in your project's specifications (Linear tickets, PRDs) and codebase structure, allowing for high-precision, context-aware navigation and verification.

## Key Features
*   **Voice Command Center:** Hands-free control. "Show me the authentication flow." -> Theia navigates to the relevant code and diagram.
*   **Visual Code Map:** Interactive architecture diagrams. Click a node in the diagram to open the corresponding file.
*   **Spec Traceability:** direct links between Linear issues and the code that implements them. "Verify this function against Ticket #123."
*   **Lazy Repo Explorer:** Seamlessly explore massive repositories without cloning everything locally, fetching files on demand.

## Main User Stories
1.  **The Contextual Reviewer:** "As a Senior Engineer, I want to understand *why* this code exists by tracing it back to the original requirement."
2.  **The Visual Navigator:** "As a New Hire, I want to learn the codebase by exploring architecture diagrams rather than grep-ing for filenames."
3.  **The Hands-Free Architect:** "As a Tech Lead, I want to dictate my review comments and navigate the PR using voice commands while I drink my coffee."

## Core Flows
### 1. The Exploration Loop
1.  User views **Architecture Diagram**.
2.  User clicks a **Node** (e.g., `AuthService`).
3.  Theia **Lazy Loads** `AuthService.ts` from the repo.
4.  Theia displays the code in **Read-Only Mode** with annotation capabilities.

### 2. The Voice Loop
1.  User speaks: *"Check if this matches the login spec."*
2.  **Actor** captures audio -> Speech-to-Text.
3.  **Director** (Gemini 3) analyzes request + current code + linked spec.
4.  **Director** returns JSON action: `{ "speak": "It misses the error handling...", "highlight": [12, 15] }`.
5.  **Voice UI** plays audio and highlights code lines 12-15.

