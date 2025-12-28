# Decision Record (ADR)
> *Goal: Capture critical trade-offs so we don't re-litigate settled debates.*

## ADR-001: The Voice Compromise
**Decision:** Use Google Cloud TTS for "Precision Mode" vs. Native Audio for "Live Mode".
**Why:** Gemini 3 is text-only. We need high-quality voice for precision.

## ADR-002: Dual-Track Response
**Decision:** Director outputs `{ voice, screen }` JSON.
**Why:** Prevent reading code blocks aloud. Separate visual content from spoken content.

## ADR-003: Client-Side Vector Store
**Decision:** Local RAG (Orama/Voy) instead of Pinecone/Weaviate.
**Why:** Privacy, Cost, and Latency. Keep it local-first.

## ADR-004: Lazy Repo Loading
**Decision:** Fetch Git Tree + On-Demand Blobs.
**Why:** Avoid cloning the entire repo. Performance for large repositories.
