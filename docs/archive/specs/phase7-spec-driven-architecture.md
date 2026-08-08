# Phase 7: Spec-Driven Traceability Architecture

## 1. The Vision
Shift Theia from "Linear Integration" to **"Universal Spec Compliance"**.
Theia should not care *where* requirements come from (Linear, Jira, Markdown). She only cares about **Atoms**: granular, testable units of intent.

## 2. Core Abstractions

### 2.1 The Universal Spec (`SpecDocument`)
The canonical representation of "What needs to be done."
```typescript
interface SpecDocument {
  id: string;          // e.g., "LIN-123" or "specs/auth.md"
  source: 'linear' | 'markdown_file' | 'manual';
  title: string;
  rawContent: string;  // The original text
  atoms: SpecAtom[];   // The granular breakdown
}
```

### 2.2 The Atomic Requirement (`SpecAtom`)
The smallest unit of logic Theia can verify.

```typescript
interface SpecAtom {
  id: string;          // e.g., "REQ-1"
  category: 'logic' | 'ui' | 'schema' | 'security';
  description: string; // "User must be redirected to /dashboard on success"
  context: string[];   // Linked files (e.g., ["auth.ts"])
  status: 'pending' | 'verified' | 'violated';
}
```

## 3. The "Hexagonal" Layers

### Layer 1: The Adapters (Input)
Responsible for fetching raw text and normalizing it.

- **LinearSpecAdapter**: Fetches Issue → Converts to Markdown.
- **FileSpecAdapter**: Reads `specs/*.md` → Returns Markdown.
- **ClipboardAdapter**: User pastes text → Returns Markdown.

### Layer 2: The Atomizer (The Brain)
- **Model:** Gemini 3 Pro (Preview)
- **Role:** Takes raw Markdown → Outputs `SpecAtom[]`.
- **Prompt Strategy:**
  > "Analyze this requirement document. Break it down into atomic, testable assertions. Ignore boilerplate. Return JSON."

### Layer 3: The Conductor (Traceability)
- **Role:** Maps `SpecAtom` → `FileNode`.
- When user opens `sensors.py`, Conductor scans active Atoms.
- If Atom #3 mentions "Sensor Schema", it injects Atom #3 into the Voice Context.
- **Result:** Theia says: *"This file matches Requirement #3, but missing the validation logic from Requirement #4."*

## 4. Implementation Plan

### Step 1: The Context Layer (`SpecContext.tsx`)
- Create `SpecProvider`.
- Maintain `activeSpec` state.
- Build the `AtomizerService`.

### Step 2: The Adapters
- Refactor existing `LinearService` into `LinearAdapter`.
- Build `FileAdapter` (Simple file picker).

### Step 3: The Traceability UI
- Update `DirectorService` to accept `SpecAtom[]` instead of `linearIssue`.
- Show "Active Requirements" in the Chat Panel side-by-side with code.
