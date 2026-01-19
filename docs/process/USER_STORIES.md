# Theia User Stories (v1.2)

This document defines the key user stories for the Theia system. Each story follows the standard **"As a... I want to... So that..."** format and includes a **Traceability Matrix** linking to the specific Functional Requirements (FR-xxx) and Non-Functional Requirements (NFR-xxx).

> [!IMPORTANT]
> This document serves as the **Integration Test Plan** for the QA process.

---

## Story 1: The Visual Explorer

**Persona:** New Developer on the team

### User Story
**As a** New Developer on the team,  
**I want to** see a clickable architecture diagram of the system,  
**So that** I can jump directly to the code responsible for specific nodes without searching.

### Scenario
| Step | Action | System Response |
|------|--------|-----------------|
| 1 | User types: *"Draw a diagram of the Agent architecture."* | Message received by Agent |
| 2 | Agent (Planner) decides to use `search_text` to find `Agent.ts` | **FR-007** activated |
| 3 | Agent (Executor) reads the file and generates Mermaid code | **FR-010** activated |
| 4 | UI renders the interactive diagram | **FR-030** activated |
| 5 | User clicks the "ExecutorNode" box in the diagram | **FR-031** activated |
| 6 | The editor splits and jumps to line 412 of `Agent.ts` | **FR-018** activated |

### Traceability Matrix
| Requirement | Description | Validation |
|-------------|-------------|------------|
| **FR-007** | Agent can search codebase | `search_text` returns results |
| **FR-010** | Agent can read file contents | Content parsed successfully |
| **FR-018** | Navigate to specific file and line | Editor highlights line 412 |
| **FR-029** | Diagram Parser (Mermaid) | Valid syntax produced |
| **FR-030** | UI renders interactive diagrams | Diagram visible |
| **FR-031** | Diagram nodes are clickable | Click triggers navigation |

---

## Story 2: The Cautious Architect

**Persona:** Senior Engineer

### User Story
**As a** Senior Engineer,  
**I want to** approve any file modifications before they happen,  
**So that** the AI doesn't accidentally delete or break critical code.

### Scenario
| Step | Action | System Response |
|------|--------|-----------------|
| 1 | User types: *"Rename `Agent.ts` to `TheiaAgent.ts`."* | Message received by Agent |
| 2 | Agent (Planner) creates plan: Check, Rename, Update imports | **FR-007** activated |
| 3 | Agent (Executor) attempts to run `write_file` | **FR-015** activated |
| 4 | **System halts.** "Permission Required" modal appears | **FR-011**, **FR-026** activated |
| 5 | User clicks "Approve" | **FR-012** activated |
| 6 | Agent resumes and completes the rename | **FR-012** completion |

### Traceability Matrix
| Requirement | Description | Validation |
|-------------|-------------|------------|
| **FR-011** | Gatekeeper intercepts sensitive tools | Execution pauses |
| **FR-012** | User can approve/reject actions | Modal works |
| **FR-015** | Agent can execute file operations | File renamed after approval |
| **FR-026** | Permission Modal renders | UI shows correct context |
| **NFR-003** | Security: No destructive action without consent | Blocked until approval |

---

## Story 3: The Deep Diver

**Persona:** Reviewer looking at a large PR

### User Story
**As a** Reviewer,  
**I want to** click on files *not* in the PR (Ghost Nodes) in the file tree,  
**So that** I can see the context of changes without downloading the whole repo.

### Scenario
| Step | Action | System Response |
|------|--------|-----------------|
| 1 | User opens a PR | File Tree renders |
| 2 | Tree shows "Hot" (changed) and "Ghost" (dimmed) files | **FR-033** activated |
| 3 | User clicks `src/utils/logger.ts` (a Ghost Node) | **FR-035** activated |
| 4 | UI shows loading spinner on node | Loading state visible |
| 5 | System fetches *only* that file from GitHub API | **NFR-006** validated (< 2s) |
| 6 | File opens in "Read-Only" mode | **FR-036** activated |

### Traceability Matrix
| Requirement | Description | Validation |
|-------------|-------------|------------|
| **FR-032** | Hybrid State (Hot + Ghost) | Both types visible in tree |
| **FR-033** | Ghost Nodes visually distinguished | Dimmed styling applied |
| **FR-035** | Ghost Node click triggers lazy load | Single file fetched |
| **FR-036** | Read-Only Mode for Ghost files | Lock icon visible |
| **NFR-006** | Lazy load latency < 2s | Content appears quickly |

---

## Story 4: The Resilience Check

**Persona:** QA Tester

### User Story
**As a** QA Tester,  
**I want to** see the Agent fix its own mistakes when a tool fails,  
**So that** I don't have to micromanage every error.

### Scenario
| Step | Action | System Response |
|------|--------|-----------------|
| 1 | User types: *"Read `config.json`."* | Message received by Agent |
| 2 | Tool fails: `Error: File not found` | Error captured in `lastError` |
| 3 | Agent (Router) **loops back to Planner** | **FR-004** activated |
| 4 | Planner creates **Repair Plan**: "List files, then read." | **FR-009** activated |
| 5 | Agent executes new plan and succeeds | **FR-005** validated |

### Traceability Matrix
| Requirement | Description | Validation |
|-------------|-------------|------------|
| **FR-004** | Self-Correction: Failure triggers re-planning | Governor routes to Planner |
| **FR-005** | Router Logic: Loop back to Executor | System recovers and finishes |
| **FR-009** | Repair Mode: Planner gets error context | Corrected plan generated |

---

## Story 5: The Shadow Partner

**Persona:** Developer debugging a complex issue

### User Story
**As a** Developer,  
**I want** Theia to silently track my navigation and focus,  
**So that** she understands my "Live Context" without me needing to explain it or be interrupted by flickers.

### Scenario
| Step | Action | System Response |
|------|--------|-----------------|
| 1 | User opens `Agent.ts`, scrolls to line 50 | **FR-039** updates context stream |
| 2 | User rapidly clicks `types.ts`, then `utils.ts` (<500ms) | **NFR-009** ignores `types.ts` (Debounce) |
| 3 | User highlights `calculateMetrics` in `utils.ts` | **FR-039** updates selection (Silent) |
| 4 | User types: *"Why is this returning null?"* | **FR-040** sends Snapshot (Agent + Utils) |
| 5 | Agent analyzes both files to answer | Answer references `Agent.ts` usage |
| 6 | Agent calls `Maps_to_code` but User is typing | **FR-042** prevents focus theft |

### Traceability Matrix
| Requirement | Description | Validation |
|-------------|-------------|------------|
| **FR-039** | Live Context Stream | Context updates silently |
| **FR-040** | Smart Context Snapshot | History included in prompt |
| **FR-041** | Barge-In Handling | Agent output pauses on user typing |
| **FR-042** | Focus Locking | Editor focus preserved during typing |
| **NFR-009** | Context Debounce | Rapid clicks ignored |

---

## Summary: Requirement Coverage

```mermaid
graph LR
    subgraph "S1: Visual Explorer"
        S1[FR-007, FR-010, FR-018, FR-029, FR-030, FR-031]
    end
    
    subgraph "S2: Cautious Architect"
        S2[FR-011, FR-012, FR-015, FR-026, NFR-003]
    end
    
    subgraph "S3: Deep Diver"
        S3[FR-032, FR-033, FR-035, FR-036, NFR-006]
    end
    
    subgraph "S4: Resilience Check"
        S4[FR-004, FR-005, FR-009]
    end

    subgraph "S5: Shadow Partner"
        S5[FR-039, FR-040, FR-041, FR-042, NFR-009]
    end
    
    S1 --> Coverage[24 Requirements Covered]
    S2 --> Coverage
    S3 --> Coverage
    S4 --> Coverage
    S5 --> Coverage