# Technical Brief: Visual Code Review (Theia)

## 1. Executive Summary
The Visual Code Review (Theia) is an interactive, AI-augmented platform designed to transform standard Pull Request (PR) data into a rich, visual experience. It combines traditional code diffing with modern LLM capabilities (text and voice), architectural diagramming, and third-party requirement tracking (Linear) to provide a "Staff-level" review environment.

## 2. Core Functionalities

### 2.1. PR Ingestion & Management
- **GitHub Integration**: Fetches PR metadata and file contents using the GitHub REST API. Supports public and private repositories (via Personal Access Token).
- **History & Caching**: Tracks recently viewed PRs and caches file contents locally (`localStorage`) to minimize API calls and improve performance.
- **File System Visualization**: 
  - Generates a hierarchical file tree from PR changes.
  - Color-coded indicators for file status (Added, Modified, Deleted, Unchanged).
  - Quick-action buttons for expanding/collapsing the entire tree.

### 2.2. Interactive Code Viewer
- **Hybrid View Modes**:
  - **Diff Mode**: Line-by-line and word-level diffing with green/red syntax highlighting.
  - **Source Mode**: Full file view for providing context beyond the changed lines.
- **Markdown Support**: Integrated previewer for `.md` files, allowing reviewers to see documentation as it will appear when rendered.
- **Context Tracking**: Automatically tracks the "visible viewport" (which lines are currently on screen) to seed the AI with context.

### 2.3. AI Agents (Theia)
- **Multi-Model Chat**: Supports `gemini-3-pro-preview` (for deep reasoning) and `gemini-3-flash-preview` (for speed).
- **Context-Aware Prompting**: The AI is automatically fed:
  - PR title and description.
  - Current selected code snippet (selection state).
  - Active viewport lines.
  - Linked Linear issue details.
- **Live Voice API**: 
  - Real-time, low-latency voice interaction using Gemini's Native Audio modalities.
  - Bi-directional transcription (User & AI).
  - Interruptible audio stream for natural conversation.

### 2.4. Architectural Visualization
- **Automated Diagramming**: Uses Gemini Flash to analyze code changes and generate Mermaid.js Sequence Diagrams.
- **Custom Generation**: Users can prompt the agent to generate specific diagrams (e.g., "Show me the auth flow").
- **Interactive Canvas**: 
  - Zoomable and pannable diagram viewer.
  - **Code Navigation (Current implementation)**: Text elements in diagrams containing `(filename:line)` patterns are parsed and injected with data attributes, enabling clicks to navigate the main code viewer.

### 2.5. External Integrations & Walkthroughs
- **Linear Integration**: Link PRs to Linear issues via API key and identifier. Acceptance criteria are injected into AI prompts for "Requirement Validation."
- **Review Walkthroughs**: Supports loading `.json` or `.md` files that define a guided tour of the PR.
  - Automates navigation to specific files and line ranges.
  - Provides section-specific notes and highlights.

## 3. User Interaction & Annotation
- **Markers & Labels**: 
  - **Markers**: Quick "points of interest" added via left-click on line numbers.
  - **Labels**: Detailed annotations (right-click or Ctrl+Click) for providing specific feedback.
- **Persistence**: All annotations are saved to `localStorage`, keyed by PR ID, ensuring they persist across sessions.

## 4. Current Architecture Details

### 4.1. State Management
- **PRContext**: The central brain of the application, managing file selection, viewport state, annotations, and integration data (Linear/Diagrams).
- **Chat/Live Contexts**: Handle the complexities of streaming text and audio, maintaining message history, and managing API connections.

### 4.2. Navigation Logic (`scrollToLine`)
- Employs fuzzy path matching (`arePathsEquivalent`) to bridge the gap between AI-generated file paths and the actual local file tree.
- Coordinates between UI panels (Diagrams, Walkthroughs, and Annotations) to focus the Code Viewer on specific coordinates.

## 5. Identified Areas for Refinement
- **Navigation Reliability**: The "Diagram-to-Code" link mechanism relies on specific string patterns and DOM injection which is currently prone to failure during rendering cycles.
- **Performance**: Large PRs (100+ files) require optimized batching for content fetching.
- **UI Responsiveness**: Complex layouts with multiple resizable panels need robust boundary handling.