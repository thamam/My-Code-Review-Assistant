// Re-export ParsedSession from the session-parser lib for use in review.ts import.
// This avoids a circular dependency: review.ts can import from here without
// directly importing from src/lib/session-parser.
export type { ParsedSession } from '../lib/session-parser/index.js';
