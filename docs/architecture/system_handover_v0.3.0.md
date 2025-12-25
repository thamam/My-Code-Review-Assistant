# System Handover: Theia v0.3.0 (The Explorer Update)

> **Handover Date:** 2025-12-25  
> **Current Branch:** `dev`  
> **Tag:** `v0.3.0`

---

## 1. Core Identity

**What is Theia?**  
A Voice-First, Spec-Driven Code Review Assistant targeting **L4 Autonomy for Code**.

**Key Differentiator:**  
Theia doesn't just "chat" — she maintains a persistent mental model of the code, verifies requirements against specs, and navigates the repository visually through diagrams and file trees.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + Vite + TypeScript |
| **Styling** | Tailwind CSS (CDN) |
| **State** | React Context (`PRContext`, `SpecContext`, `ChatContext`, `LiveContext`) |
| **Diagrams** | Mermaid.js 10.x |

### AI Models

| Role | Model | Purpose |
|------|-------|---------|
| **Director (Brain)** | `gemini-3-pro-preview` | Reasoning, Spec Atomization, Diagram Generation |
| **Voice (Conversation)** | `gemini-2.0-flash-exp` | Native Audio via WebSocket (Live API) |
| **Voice (Precision)** | Google Cloud TTS `en-US-Journey-F` | High-quality voice for screen output |

---

## 3. Key Architectural Patterns

### Director/Actor Pattern
```
┌─────────────────────────────────────────────────┐
│                  USER QUERY                     │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  DIRECTOR (gemini-3-pro)                        │
│  - Thinks silently                              │
│  - Generates JSON instructions                  │
│  - Returns: { voice: "...", screen: "..." }     │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  ACTOR (LiveContext / TTS)                      │
│  - Speaks naturally to user                     │
│  - Displays technical content on screen         │
└─────────────────────────────────────────────────┘
```

### Hexagonal Spec Architecture (Phase 7)
```
┌──────────────┐     ┌──────────────┐
│ Linear API   │────▶│              │
└──────────────┘     │   ADAPTERS   │────▶ SpecDocument
┌──────────────┐     │              │
│ Markdown     │────▶└──────────────┘
└──────────────┘            │
                            ▼
                    ┌──────────────┐
                    │  ATOMIZER    │────▶ SpecAtom[]
                    │ (gemini-3)   │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  DIRECTOR    │ verifies code against atoms
                    └──────────────┘
```

### The Lazy Graph (Phase 9)
```
┌─────────────────────────────────────────────────┐
│  PR FILES (Eager)                               │
│  - Full content + diff loaded on PR fetch       │
│  - Status: added/modified/deleted               │
└─────────────────────────────────────────────────┘
                      +
┌─────────────────────────────────────────────────┐
│  REPO TREE (Lazy)                               │
│  - Git Tree API: paths + SHAs only              │
│  - Content fetched on-demand (Ghost Nodes)      │
│  - Displayed as "Read Only" when loaded         │
└─────────────────────────────────────────────────┘
```

**Key Interfaces:**
- `RepoNode`: `{ path, type, sha, mode?, size? }`
- `LazyFile`: `{ path, content, sha, isReadOnly: true }`

---

## 4. Feature Map

| Phase | Feature | Key Files |
|-------|---------|-----------|
| **6** | Director/Actor Architecture | `DirectorService.ts`, `LiveContext.tsx` |
| **7** | Spec-Driven Traceability | `SpecContext.tsx`, `AtomizerService.ts`, `SpecPanel.tsx` |
| **8** | Diagram Navigation | `DiagramParser.ts`, `DiagramTypes.ts`, `§filepath:line` syntax |
| **9** | Full Repo Access | `PRContext.tsx` (repoTree, lazyFiles), `FileTree.tsx` (ghost nodes) |

---

## 5. Critical Files Reference

| File | Purpose |
|------|---------|
| `contexts/PRContext.tsx` | Core state: files, diagrams, navigation, lazy loading |
| `contexts/SpecContext.tsx` | Spec documents, atoms, adapter coordination |
| `contexts/LiveContext.tsx` | Voice mode, WebSocket, Director integration |
| `services/github.ts` | GitHub API: PR, Tree, Content fetching |
| `src/services/DirectorService.ts` | Brain: reasoning, dual-track responses |
| `src/services/AtomizerService.ts` | Breaks specs into atomic requirements |

---

## 6. Test Coverage

| Test File | Coverage |
|-----------|----------|
| `director-actor.spec.ts` | Director/Actor flow, state inspection |
| `voice-iq.spec.ts` | Voice mode LLM grounding |
| `spec-traceability.spec.ts` | Spec atomization and verification |
| `diagram-navigation.spec.ts` | Diagram tab and navigation |
| `full-repo-integration.spec.ts` | Phase 8+9 integration (8/8 passing) |

---

## 7. Phase 10 Roadmap: The Semantic Brain

### Problem
We can navigate files, but we cannot **search by intent**:
- ❌ "Find the authentication logic"
- ❌ "Where is error handling for API calls?"

### Solution: Vector Search (RAG)
1. **Embeddings:** Generate vectors for code chunks
2. **Index:** Store in vector DB (Pinecone/Weaviate)
3. **Query:** Semantic search returns relevant code locations
4. **Integration:** Director uses search results for grounded answers

### Proposed Architecture
```
User Query ──▶ Embedding ──▶ Vector Search ──▶ Relevant Chunks
                                                    │
                                                    ▼
                                              Director + Context
                                                    │
                                                    ▼
                                              Grounded Response
```

---

## 8. Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_GEMINI_API_KEY` | Gemini API access |
| `VITE_GITHUB_TOKEN` | GitHub API (optional, for rate limits) |
| `VITE_LINEAR_API_KEY` | Linear integration |
| `GOOGLE_APPLICATION_CREDENTIALS` | Cloud TTS service account |

---

## 9. Quick Start for Next Agent

```bash
# 1. Start dev server
npm run dev

# 2. Run all tests
npx playwright test --project=chromium

# 3. Build for production
npm run build
```

**Current Status:**
- ✅ All features working
- ✅ 8/8 integration tests passing
- ✅ Build succeeds
- 📍 Ready for Phase 10

---

*Generated: 2025-12-25 | Theia v0.3.0*
