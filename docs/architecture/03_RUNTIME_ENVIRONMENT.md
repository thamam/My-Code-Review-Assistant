# 03. Runtime Environment (L2)
> *The Sandbox: WebContainer Execution*

## Core Concept: Browser-Native Execution
To allow the Agent to run tests and scripts without compromising the user's host machine, we use **WebContainers** (Node.js in the browser). This provides an isolated compliance boundary.

## Capabilities

### 1. File System Sync
The WebContainer has its own virtual file system. We mirror the necessary parts of the "Lazy Graph" into the container so usage feels local.
*   **Mounting:** `LazyFile` contents are written to the virtual FS.

### 2. Command Execution
The Agent can invoke standard Node.js commands:
*   `npm install <pkg>`
*   `npm start`
*   `npm test`
*   `node script.js`

### 3. Isolation Boundary
*   **Network:** Restricted (configurable).
*   **Files:** Virtualized. Cannot touch user's OS outside the browser tab.
*   **Process:** Runs in a Service Worker.

## Architecture

```mermaid
dropdown
block-beta
    columns 1
    
    block:Host
        HostOS(("Host OS"))
        Browser(("Browser Engine"))
    end
    
    block:Sandbox
        WebContainer(("WebContainer"))
        
        block:Internals
            VirtualFS["Virtual FS"]
            NodeProcess["Node Process"]
            NetworkStack["Network Shim"]
        end
    end
    
    HostOS -- "WASM" --> Browser
    Browser -- "Service Worker" --> WebContainer
    WebContainer -- "Mount" --> VirtualFS
```

## Security Model
*   **Untrusted Code:** AI-generated code runs strictly inside the WebContainer.
*   **Secrets:** API keys are injected via environment variables only if explicitly authorized.
*   **Persistence:** Ephemeral by default. Changes must be explicitly "committed" back to the main `GitHubService` to be saved.
