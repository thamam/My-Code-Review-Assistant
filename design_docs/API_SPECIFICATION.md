# TH-FDD-02: API Specifications & Tool Contracts

## 1. INTERNAL PROTOCOL: THE EVENTBUS
The EventBus uses a JSON-based protocol. Below are the primary event definitions.

### 1.1 Input Signals (UI -> Agent)
| Event Type | Payload Schema | Description |
| :--- | :--- | :--- |
| `USER_MESSAGE` | `{ text: string, context: UIContext, prData: any }` | The primary input trigger. |
| `USER_APPROVAL` | `{ approved: boolean }` | User response to a sensitive tool request. |
| `UI_INTERACTION`| `{ action: string, target: string, metadata: any }` | Clicks, file selections, or diagram interactions. |

### 1.2 Output Signals (Agent -> UI)
| Event Type | Payload Schema | Description |
| :--- | :--- | :--- |
| `AGENT_SPEAK` | `{ voice: string, screen: string }` | The dual-track response packet. |
| `AGENT_NAVIGATE`| `{ target: { file: string, line: number }, reason: string }` | Command to change editor view. |
| `AGENT_THINKING`| `{ stage: 'started'\|'processing'\|'completed', message: string }` | UI state indicator. |
| `AGENT_EXEC_CMD`| `{ command: string, args: string[] }` | Request to run a terminal command. |

---

## 2. AGENT TOOL CONTRACTS (Function Calling)
These are the JSON schemas used by Gemini for tool selection.

### 2.1 Navigation Tools
```json
{
  "name": "navigate_to_code",
  "description": "Jump to a file and line number.",
  "parameters": {
    "type": "object",
    "properties": {
      "filepath": { "type": "string" },
      "line": { "type": "number" }
    }
  }
}
```

### 2.2 Knowledge Tools
```json
{
  "name": "search_text",
  "description": "Recursive content search (Grep) across all files.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    }
  }
}
```

---

## 3. EXTERNAL SERVICE CONTRACTS

### 3.1 Google Gemini (Cognitive Engine)
*   **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent`
*   **Method:** POST
*   **Auth:** API Key in URL (`?key=...`)
*   **Request Schema:**
    ```json
    {
      "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
      "systemInstruction": { "parts": [{ "text": "..." }] },
      "tools": [{ "functionDeclarations": [...] }]
    }
    ```

### 3.2 Google Cloud TTS (Voice)
*   **Endpoint:** `https://texttospeech.googleapis.com/v1/text:synthesize`
*   **Method:** POST
*   **Request Schema:**
    ```json
    {
      "input": { "text": "..." },
      "voice": { "languageCode": "en-US", "name": "en-US-Journey-F" },
      "audioConfig": { "audioEncoding": "MP3" }
    }
    ```

---

## 4. RUNTIME SYSTEM CALLS
Since WebContainers are limited, complex shell operations are wrapped in Node.js scripts.

### 4.1 Recursive Search
*   **Command:** `node -e <script>`
*   **Implementation:** A Node script that traverses the directory and uses `fs.readFileSync` for string matching.

### 4.2 File Writing
*   **Command:** `node -e <script>`
*   **Implementation:** Decodes Base64 content and writes using `fs.writeFileSync`, ensuring parent directories exist via `fs.mkdirSync({recursive: true})`.

---
**Status:** API SPEC COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-FDD-02
