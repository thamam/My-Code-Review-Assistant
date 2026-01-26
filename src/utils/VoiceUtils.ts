/**
 * Utility functions for voice processing and TTS sanitization.
 */

/**
 * Sanitizes text for TTS by removing code blocks, backticks, and other non-verbal syntax.
 * Targeted for NFR-008: Voice-Code Separation.
 */
export function sanitizeForVoice(text: string): string {
  if (!text) return '';

  return text
    // Remove multi-line code blocks: ```lang ... ```
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code and its content: `...`
    .replace(/`[^`]+`/g, '')
    // Clean up double spaces that might result from stripping
    .replace(/\s\s+/g, ' ')
    .trim();
}
