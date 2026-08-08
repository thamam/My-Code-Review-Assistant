# Operation: Theia QA Campaign (Story-Driven)

**Objective:** Raise the Readiness Score of all 5 User Stories to **10/10**.
**Exit Criteria:** All associated Functional Requirements (FRs) must reach Maturity Level 9 or 10.
**Methodology:** The "Gauntlet" Protocol.

---

## 🛠️ The Protocol: "The Gauntlet"

For each User Story, the Agent must execute the following cycle:

1.  **Analyze Traceability:** Load `USER_STORIES.md` and identify all linked FR-xxx items.
2.  **Check Maturity:** Cross-reference with `REQUIREMENTS_MASTER_DETAILED.csv`.
3.  **Identify Blockers:** Isolate requirements with Maturity < 9.
4.  **Execute Fix:**
    * *If Code Bug:* Generate and apply the hotfix (e.g., `write_file` quoting fix).
    * *If Logic Flaw:* Update the Prompt or State Graph logic.
    * *If Missing:* Implement the feature.
5.  **Simulation Test:** Run the "Scenario" described in the User Story to verify the fix.
6.  **Promote:** Update `REQUIREMENTS_MASTER_DETAILED.csv` maturity scores to 9/10.

---

## ⚔️ Campaign Phases

### Phase 1: The Foundation (Unblocking Stories 1 & 2)
**Target Stories:** "The Visual Explorer" & "The Cautious Architect"
**Critical Blockers:**
* 🔴 **FR-015 (Maturity 4):** `write_file` tool fails on quoting.
* 🔴 **FR-016 (Maturity 4):** `search_text` tool fails on shell syntax.
**Action:** Apply the `Agent.ts` runtime hotfix (Command Separation).
**Success Indicator:** Agent can rename a file and search for a string without crashing.

### Phase 2: The Logic (Refining Story 4)
**Target Story:** "The Resilience Check"
**Critical Blockers:**
* 🟡 **FR-009 (Maturity 7):** Repair Mode logic is inconsistent.
**Action:** Refine the `plannerNode` "Repair Prompt" to better analyze `lastError`.
**Success Indicator:** Agent consistently recovers from a "File Not Found" error without loops.

### Phase 3: The Experience (Polishing Story 5)
**Target Story:** "The Shadow Partner"
**Critical Blockers:**
* 🟡 **FR-041 (Maturity 7):** Barge-In handling (interruptions).
**Action:** Verify `EventBus` listener logic for user typing events during Agent output.
**Success Indicator:** Agent stops "speaking" immediately when user types.

### Phase 4: The Speed (Validating Story 3)
**Target Story:** "The Deep Diver"
**Critical Blockers:**
* 🟢 **NFR-006 (Maturity 7):** Latency checks.
**Action:** Stress test GitHub API fetching.
**Success Indicator:** Ghost nodes load in < 2s consistently.

---

## 📊 Scorecard Tracking

| Story | Starting Score | Current Score | Status |
| :--- | :--- | :--- | :--- |
| **1. Visual Explorer** | 9.2 | 9.8 | 🟢 READY |
| **2. Cautious Architect** | 8.6 | 9.6 | 🟢 READY |
| **3. Deep Diver** | 9.0 | 9.0 | 🟢 READY |
| **4. Resilience Check** | 7.7 | 9.5 | 🟢 READY |
| **5. Shadow Partner** | 8.2 | 8.2 | 🟡 BETA |
