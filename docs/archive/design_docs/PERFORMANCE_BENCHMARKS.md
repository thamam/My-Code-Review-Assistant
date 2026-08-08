# TH-OPS-02: Performance Benchmarks & Optimization

## 1. PERFORMANCE TARGETS (KPIs)

| Metric | Target | Rationale |
| :--- | :--- | :--- |
| **Lazy Load Latency** | < 2,000ms | Ensure the "Ghost Node" experience feels native. |
| **Voice Turn-around (TTT)** | < 1,500ms | Maintain the flow of natural conversation. |
| **Sandbox Boot Time** | < 5,000ms | Minimize wait time during session initialization. |
| **UI Responsiveness** | < 100ms | Prevent "Jank" during event-driven state updates. |
| **Context Assembly** | < 500ms | Fast gathering of relevant files before LLM call. |

---

## 2. BENCHMARKING STRATEGY

### 2.1 Lazy Load Stress Test
*   **Scenario:** Rapidly clicking 10 different "Ghost Nodes" in the file tree.
*   **Measurement:** Time from `UI_INTERACTION` to `SYSTEM_FILE_SYNC` and editor render.
*   **Verification:** Verify **NFR-007 (Caching)** prevents redundant network calls for previously fetched files.

### 2.2 Turn-around Time (TAT) Measurement
*   **Scenario:** User says "Explain this file".
*   **Measurement:** Time from `VOICE_INPUT` to first byte of `AGENT_SPEAK`.
*   **Breakdown:** 
    *   STT Processing (~300ms)
    *   Agent Reasoning (~800ms)
    *   TTS Synthesis (~400ms)

---

## 3. OPTIMIZATION STRATEGIES

### 3.1 Context Debouncing (NFR-009)
*   **Problem:** Rapid user navigation triggers multiple `USER_ACTIVITY` events, causing LLM context overload.
*   **Solution:** Ignore navigation events that occur within < 500ms of each other. Only "Final" destination is used for reasoning.

### 3.2 Ghost File Caching
*   **Implementation:** Use an in-memory `Map<filePath, content>` (the `lazyFiles` cache).
*   **Effect:** Reduces GitHub API calls and provides "Instant" reload for visited files.

### 3.3 Prompt Compression
*   **Implementation:** Summarize long conversation histories into the `ContextSnapshot` rather than sending full raw history.
*   **Effect:** Saves tokens and improves reasoning speed by reducing noise.

### 3.4 Selective TTS (NFR-008)
*   **Implementation:** Use `Dual-Track` to only synthesize the concise summary.
*   **Effect:** Reduces audio payload size and synthesis time significantly compared to reading full markdown.

---

## 4. INSTRUMENTATION
*   Use `console.time()` / `console.timeEnd()` around critical paths (`WebContainer.boot`, `fetchFile`).
*   Log performance metrics to the `EventBus` as `SYSTEM_METRIC` events for real-time monitoring.

---
**Status:** PERFORMANCE DESIGN COMPLETE
**Generated:** 2026-01-25
**Artifact ID:** TH-OPS-02
