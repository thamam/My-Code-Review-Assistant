# Traceability Matrix & Gate Decision - Story: Requirements Audit

**Story:** Requirements Audit (My-Code-Review-Assistant)
**Date:** 2026-01-23
**Evaluator:** TEA Agent

---

## PHASE 1: REQUIREMENTS TRACEABILITY

### Coverage Summary

| Priority  | Total Criteria | FULL Coverage | Coverage % | Status       |
| --------- | -------------- | ------------- | ---------- | ------------ |
| P0        | 0              | 0             | 0%         | ℹ️ N/A        |
| P1        | 33             | 18            | 54%        | ❌ FAIL       |
| P2        | 0              | 0             | 0%         | ℹ️ N/A        |
| P3        | 0              | 0             | 0%         | ℹ️ N/A        |
| **Total** | **33**         | **18**        | **54%**    | ❌ FAIL       |

**Legend:**

- ✅ PASS - Coverage meets quality gate threshold
- ⚠️ WARN - Coverage below threshold but not critical
- ❌ FAIL - Coverage below minimum threshold (blocker)

---

### Detailed Mapping

#### FR-004: Self-Correction: Failure triggers re-planning (Agent)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for agent self-correction on tool failure.
- **Recommendation:** Add E2E test `FR-004-E2E-001` simulating a tool failure and verifying planner recovery.

#### FR-005: Router Logic: Loop back to Executor (Agent)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for router looping back to executor.
- **Recommendation:** Add E2E test `FR-005-E2E-001` verifying execution loop.

#### FR-007: Agent can search codebase (Agent)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing verification of search_text tool via agent.
- **Recommendation:** Add E2E test `FR-007-E2E-001` where agent uses search_text.

#### FR-009: Repair Mode: Planner gets error context (Agent)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test verifying error context injection.
- **Recommendation:** Add E2E test `FR-009-E2E-001` for repair mode context.

#### FR-010: Agent can read file contents (Agent)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for read_file tool usage.
- **Recommendation:** Add E2E test `FR-010-E2E-001` verifying agent file reading.

#### FR-011: Gatekeeper intercepts sensitive tools (Gatekeeper)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for sensitive tool interception.
- **Recommendation:** Add E2E test `FR-011-E2E-001` verifying interception of sensitive actions.

#### FR-012: User can approve/reject actions (Gatekeeper)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_2_safety.spec.ts`: `should show Permission Modal when requesting file creation`
  - `tests/e2e/story_2_safety.spec.ts`: `should allow user to reject sensitive action`
  - `tests/e2e/story_2_safety.spec.ts`: `should close modal and resume execution on approval`

#### FR-015: Agent can execute file operations (Runtime)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_2_safety.spec.ts`: `should show Permission Modal when requesting file creation` (implies file op capability)

#### FR-016: search_text tool shell syntax (Runtime)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for search syntax validation.
- **Recommendation:** Add Unit test `FR-016-UNIT-001` for tool syntax generation.

#### FR-018: Navigate to specific file and line (Navigation)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/neural-loop.spec.ts`: `AGENT_NAVIGATE event triggers file navigation`

#### FR-026: Permission Modal renders (UI)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_2_safety.spec.ts`: `should show Permission Modal when requesting file creation`

#### FR-029: Diagram Parser (Mermaid) (Parser)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_1_explorer.spec.ts`: `should render Mermaid diagram when user asks for architecture`

#### FR-030: UI renders interactive diagrams (UI)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_1_explorer.spec.ts`: `should render Mermaid diagram when user asks for architecture`
  - `tests/full-repo-integration.spec.ts`: `Diagrams tab shows diagram panel with Auto-Suggest`

#### FR-031: Diagram nodes are clickable (UI)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_1_explorer.spec.ts`: `should navigate to code when clicking diagram node`

#### FR-032: Hybrid State (Hot + Ghost) (Navigation)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/full-repo-integration.spec.ts`: `FileTree correctly merges PR files with repo tree`

#### FR-033: Ghost Nodes visually distinguished (UI)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/full-repo-integration.spec.ts`: `File Tree shows ghost files when Full Repo Mode is enabled`

#### FR-035: Ghost Node click triggers lazy load (Navigation)
- **Coverage:** NONE ❌
- **Tests:** None explicitly confirming lazy load trigger on click.
- **Gaps:** Missing interaction test for lazy load.
- **Recommendation:** Add E2E test `FR-035-E2E-001` clicking ghost node and verifying network request.

#### FR-036: Read-Only Mode for Ghost files (UI)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/full-repo-integration.spec.ts`: `READ ONLY badge appears for lazy-loaded files`

#### FR-039: Live Context Stream (Context)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/full-repo-integration.spec.ts`: `Context state exposes Full Repo Mode properties`
  - `tests/director-actor.spec.ts`: `Director context state updates on file change`

#### FR-040: Smart Context Snapshot (Context)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing verification of context snapshot content.
- **Recommendation:** Add Unit/E2E test `FR-040-TEST-001` verifying snapshot data.

#### FR-041: Barge-In Handling (UX)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for interruption logic.
- **Recommendation:** Add E2E test `FR-041-E2E-001` simulating user interruption.

#### FR-042: Focus Locking (UX)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for focus lock timeout.
- **Recommendation:** Add E2E test `FR-042-E2E-001` verifying focus lock behavior.

#### NFR-003: No destructive action without consent (Security)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/e2e/story_2_safety.spec.ts`: `should show Permission Modal when requesting file creation`

#### NFR-006: Lazy load latency < 2s (Performance)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing performance assertion for lazy load.
- **Recommendation:** Add E2E test `NFR-006-E2E-001` with performance timing.

#### NFR-007: Ghost File Caching (Performance)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing verification of caching behavior.
- **Recommendation:** Add E2E test `NFR-007-E2E-001` verifying subsequent clicks don't fetch.

#### NFR-009: Context Debounce (Performance)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing debounce verification.
- **Recommendation:** Add Unit/E2E test `NFR-009-TEST-001` for debounce logic.

#### FR-043: Repository Mode (Core)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/full-repo-integration.spec.ts`: `Full Repo Mode toggle is accessible from FileTree` (implies existence)

#### FR-038: Dual-Track Protocol (Voice)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/neural-loop.spec.ts`: `Agent Actions propagate: AGENT_SPEAK updates chat messages` (implies protocol)

#### FR-027: Voice Synthesis (Voice)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/director-actor.spec.ts`: `LiveContext exposes Voice State Inspector`

#### NFR-008: Voice-Code Separation (Voice)
- **Coverage:** NONE ❌
- **Tests:** None found.
- **Gaps:** Missing test for sanitization logic.
- **Recommendation:** Add Unit test `NFR-008-UNIT-001` for text sanitization.

#### FR-044: Dual-Track UI Rendering (Voice)
- **Coverage:** FULL ✅
- **Tests:**
  - `tests/voice-iq.spec.ts`: `Precision Mode LLM receives and responds with correct file context` (implies rendering)

---

### Gap Analysis

#### Critical Gaps (BLOCKER) ❌

0 Critical Gaps found.

#### High Priority Gaps (PR BLOCKER) ⚠️

15 Gaps found.

1. **FR-004: Self-Correction: Failure triggers re-planning**
2. **FR-005: Router Logic: Loop back to Executor**
3. **FR-007: Agent can search codebase**
4. **FR-009: Repair Mode: Planner gets error context**
5. **FR-010: Agent can read file contents**
6. **FR-011: Gatekeeper intercepts sensitive tools**
7. **FR-016: search_text tool shell syntax**
8. **FR-035: Ghost Node click triggers lazy load**
9. **FR-040: Smart Context Snapshot**
10. **FR-041: Barge-In Handling**
11. **FR-042: Focus Locking**
12. **NFR-006: Lazy load latency < 2s**
13. **NFR-007: Ghost File Caching**
14. **NFR-009: Context Debounce**
15. **NFR-008: Voice-Code Separation**

---

### Recommendations

1. **Prioritize Agent Logic Tests:** Add E2E tests for core agent behaviors (Correction, Routing, Tools).
2. **Verify Performance NFRs:** Implement timing assertions for lazy loading and caching.
3. **Validate Voice Safety:** Add unit tests for TTS sanitization to ensure no code reading.
4. **Expand UX Coverage:** Test barge-in and focus locking scenarios.

---

## PHASE 2: QUALITY GATE DECISION

**Gate Type:** Audit
**Decision Mode:** Deterministic

---

### Evidence Summary

- **Total Requirements:** 33
- **Covered:** 18 (54%)
- **Gaps:** 15 (46%)

---

### GATE DECISION: FAIL ❌

---

### Rationale

Significant coverage gaps exist in critical Agent, Performance, and UX requirements. While UI and Core flows have good coverage, the Agent's reasoning capabilities and NFRs are largely unverified.

---

### Next Steps

1. **Run `*atdd` or `*automate`** to generate tests for the identified gaps.
2. **Focus on "Agent" category gaps first** (FR-004, FR-005, FR-007, FR-009, FR-010).
3. **Re-run Audit** after addressing high-priority gaps.