import { Walkthrough, WalkthroughSection } from '../types';

/**
 * Returns the active walkthrough section by ID, or null if not found.
 * Centralises the 5-way duplicated `sections.find(s => s.id === id)` pattern.
 */
export function getActiveSection(
  walkthrough: Walkthrough | null | undefined,
  sectionId: string | null | undefined
): WalkthroughSection | null {
  if (!walkthrough || !sectionId) return null;
  return walkthrough.sections.find(s => s.id === sectionId) ?? null;
}
