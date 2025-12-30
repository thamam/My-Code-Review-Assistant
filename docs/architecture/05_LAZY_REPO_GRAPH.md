# 05. Lazy Repo Graph (L2)
> *The Territory: Infinite Exploration*

## Core Concept: Hybrid State (`PR + Repo`)
To avoid the cost of cloning a full 10GB repo, we maintain a **Hybrid State**:
1.  **PR Files:** The small set of changed files (Always loaded).
2.  **Repo Tree:** A lightweight JSON tree of the *entire* repo (Loaded once).
3.  **Ghost Nodes:** Files fetched individually *on-demand*.

## Source of Truth
*   `src/contexts/PRContext.tsx`: Manages the state.
*   `src/services/github.ts`: API wrapper.
*   `src/components/FileTree/FileTree.tsx`: Visualizer.

## Data Structures

```typescript
interface LazyFile {
  path: string;
  content: string | null; // Null if not yet fetched
  sha: string;
  isReadOnly: boolean; // True for Ghost Nodes, False for PR files
  fetchedAt: number;
}
```

## The Lazy Loading Sequence

```mermaid
sequenceDiagram
    participant User
    participant FileTree
    participant PRContext
    participant GitHub

    User->>FileTree: Expand "utils/"
    note right of FileTree: Uses Cached RepoTree (Metadata only)
    FileTree->>User: Shows "db.ts" (Ghost)
    
    User->>FileTree: Click "db.ts"
    FileTree->>PRContext: loadGhostFile("utils/db.ts")
    
    alt File Cached?
        PRContext-->>PRContext: Return existing LazyFile
    else Fetch Needed
        PRContext->>GitHub: GET /repos/.../contents/utils/db.ts
        GitHub-->>PRContext: Base64 Content
        PRContext->>PRContext: Cache in Map<path, LazyFile>
    end
    
    PRContext->>User: Display Read-Only Code
```

## Ghost Nodes vs. PR Nodes
| Feature | PR Node (Changed) | Ghost Node (Unchanged) |
| :--- | :--- | :--- |
| **Source** | `prData.files` | `github.fetchFile` |
| **Edit Mode** | Read/Comment | Read-Only |
| **Highlighting** | Diff Green/Red | Standard Syntax |
| **Availability** | Immediate | Async (Active Fetch) |
