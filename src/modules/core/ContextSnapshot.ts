/**
 * Utilities for building context snapshots for the Agent.
 */

interface Message {
  role: string;
  text: string;
}

/**
 * Builds a string representation of the current context for the LLM (FR-040).
 * Includes conversation history and other relevant state.
 */
export function buildContextSnapshot(history: Message[]): string {
  let snapshot = "=== SMART CONTEXT SNAPSHOT ===\n\n";
  
  if (history && history.length > 0) {
    snapshot += "## CONVERSATION_HISTORY\n";
    history.forEach(msg => {
      snapshot += `${msg.role}: ${msg.text}\n`;
    });
  }
  
  return snapshot;
}

