# Source Tree Analysis - My-Code-Review-Assistant

## Project Structure Overview

The project is a React-based web application structured as a monolith, focusing on AI-assisted code review and visualization.

```
/
├── components/          # React components (UI layer)
│   ├── Annotations/    # Code annotation and commenting
│   ├── ChatPanel/      # AI chat interface (Voice + Screen tracks)
│   ├── CodeViewer/     # Source and Diff viewing (Vite/Prism)
│   ├── Diagrams/       # Mermaid-based interactive diagrams
│   ├── FileTree/       # Navigation (Hot + Ghost nodes)
│   ├── RuntimePanel/   # WebContainer-based execution environment
│   ├── Specs/          # PR and Requirement visualization
│   └── Walkthrough/    # Guided review tours
├── contexts/            # React Contexts (Global state)
│   ├── ChatContext.tsx  # Message history and agent state
│   ├── LiveContext.tsx  # Active file and selection state
│   ├── PRContext.tsx    # Pull Request data and metadata
│   └── SpecContext.tsx  # Requirements and Atomizer state
├── docs/                # Project Documentation
│   ├── architecture/    # Detailed architectural modules
│   ├── specs/           # Functional and technical specifications
│   └── process/         # QA and operational protocols
├── services/            # Client-side business logic
│   ├── diagramAgent.ts  # Mermaid diagram generation
│   ├── github.ts        # PR and Repo fetching
│   ├── linear.ts        # Issue tracking integration
│   └── walkthroughParser.ts
├── src/                 # Core logic and services
│   ├── adapters/        # Data normalization (Linear, File)
│   ├── services/        # Backend-like services (Director, Voice)
│   ├── prompts/         # LLM prompt templates
│   └── types/           # Shared TypeScript definitions
├── tests/               # Playwright E2E and Vitest unit tests
├── utils/               # Shared utility functions
├── App.tsx              # Main application entry
├── index.tsx            # DOM entry point
└── QA_LOG.md            # Traceability and test results
```

## Critical Directories

| Directory | Purpose |
| :--- | :--- |
| `components/` | Contains the visual building blocks of the "Theia" interface. |
| `contexts/` | Manages the "Nervous System" of the application (EventBus/Context). |
| `src/services/` | Contains the heavy-lifting logic like the `DirectorService` (AI Orchestrator) and `VoiceService`. |
| `docs/specs/` | Contains the single source of truth for requirements (`REQUIREMENTS.csv`). |
| `tests/` | Comprehensive test suites ensuring agent stability and voice quality. |

## Entry Points

- **Web Entry:** `index.tsx` renders `App.tsx` which initializes the global contexts and layouts.
- **AI Entry:** `src/services/DirectorService.ts` handles the orchestration of AI reasoning and tool calls.
- **Voice Entry:** `src/services/VoiceService.ts` manages TTS/STT and the Dual-Track protocol.
