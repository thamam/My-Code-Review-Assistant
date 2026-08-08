# TH-QA-03: Process Manual (Workflow & Contribution)

## 1. VERSION CONTROL STRATEGY

### 1.1 Branching Model (GitFlow Simplified)
*   **`main`**: The production-ready state. Always stable.
*   **`develop`**: The integration branch for features.
*   **`feature/`**: Individual feature development.
*   **`hotfix/`**: Urgent fixes for `main`.

### 1.2 Branching Naming Convention
*   `feat/[feature-name]` (e.g., `feat/cloud-tts`)
*   `fix/[bug-description]` (e.g., `fix/file-sync-timeout`)
*   `docs/[doc-name]` (e.g., `docs/architecture-update`)

---

## 2. CODE REVIEW PROCESS

### 2.1 The "Theia" Rule
Every PR must be reviewed by the **Theia Agent** first.
1.  Developer opens PR.
2.  Theia scans the diff.
3.  Theia checks against **SpecAtoms**.
4.  Theia leaves a "Contextual Comment" summary.

### 2.2 Human Review Checklist
*   **Traceability:** Does the PR reference a Requirement ID (e.g., FR-038)?
*   **Performance:** Does this change impact the < 2s latency budget?
*   **Security:** Are any new sensitive tools added to the Gatekeeper?
*   **Tests:** Are there new Playwright/Vitest specs for the feature?

---

## 3. RELEASE CADENCE
*   **Beta/Weekly:** Integration to `develop` and staging deployment.
*   **Stable/Monthly:** Deployment to `main` after full regression suite passes.

---

## 4. DOCUMENTATION STANDARDS (BMAD)
Theia follows the **Verification Driven Development (VDD)** and **Anti-Gravity Protocol**:
1.  **Traceability Audit:** No code without a requirement.
2.  **Telemetry First:** Demand logs (EventBus) before diagnosing.
3.  **Operation Glass Box:** Maintain the internal observability of the Agent.

---

## 5. CHANGELOG FORMAT
```markdown
## [v1.2.0] - 2026-01-25
### Added
- [FR-043] Repository Mode initialization.
- [FR-038] Dual-Track Voice protocol.

### Fixed
- [FR-015] Write_file base64 encoding issue.
- [NFR-006] Lazy loading latency optimizations.

### Security
- [FR-011] Sensitive tool interception for shell scripts.
```

---
**Status:** PROCESS MANUAL COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-QA-03
