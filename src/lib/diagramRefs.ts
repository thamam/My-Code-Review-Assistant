/**
 * Pure diagram §-reference pipeline.
 *
 * Parses `{description}§{filepath}:{line}` annotations out of Mermaid
 * source, and binds them back to rendered SVG label text via an explicit
 * plan instead of trusting DOM ordering to stay stable across renders.
 */

import { resolveFilePath } from '../../utils/fileUtils';

// Pattern: {description}§{filepath}:{line}
// Matches in Sequence: User->>System: Label§file:10
// Matches in Flowchart: A[Label§file:10]
// Matches in Class: class MyClass["MyClass§file:10"]
// Matches in State: state "Label§file:10" as s1
export const REF_PATTERN = /([^:\n>\["]+)§([^:\n"\]]+):(\d+)/g;

export interface DiagramRef {
  id: string;
  description: string;
  filePath: string;
  line: number;
  ordinal: number;
  /** Undefined until resolveRefPaths runs; null means no current file matches. */
  resolvedPath?: string | null;
}

export interface Binding {
  ref: DiagramRef;
  labelIndex: number;
  matchedBy: 'text' | 'ordinal';
}

// djb2 — deterministic and stable across runs/sessions, unlike Math.random().
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function extractRefs(mermaidCode: string): { cleanedCode: string; refs: DiagramRef[] } {
  if (!mermaidCode) return { cleanedCode: '', refs: [] };

  const refs: DiagramRef[] = [];
  let ordinal = 0;

  const cleanedCode = mermaidCode.replace(REF_PATTERN, (_match, rawDescription, rawFilePath, rawLine) => {
    const description = rawDescription.trim();
    const filePath = rawFilePath.trim();
    const parsedLine = parseInt(rawLine, 10);
    const line = isNaN(parsedLine) ? 1 : parsedLine;
    const id = djb2(`${ordinal}:${description}:${filePath}:${line}`);

    refs.push({ id, description, filePath, line, ordinal });
    ordinal += 1;

    return description;
  });

  return { cleanedCode, refs };
}

/**
 * Binds rendered SVG label text back to refs. Text match wins whenever a
 * label's trimmed text uniquely identifies one ref (robust to Mermaid
 * reordering elements). Ordinal (positional) fallback then binds index-by-
 * index over the overlapping min(labels, refs) range — a count mismatch
 * means Mermaid dropped/added elements, so anything past the shorter list
 * can no longer be trusted and is left unmatched rather than misrouted, but
 * the overlapping indices still resolve instead of losing all binding.
 */
export function buildBindingPlan(svgLabels: string[], refs: DiagramRef[]): Binding[] {
  const descriptionCounts = new Map<string, number>();
  refs.forEach(ref => {
    const key = ref.description.trim();
    descriptionCounts.set(key, (descriptionCounts.get(key) ?? 0) + 1);
  });

  const usedRefIds = new Set<string>();
  const matchedLabelIndices = new Set<number>();
  const bindings: Binding[] = [];

  svgLabels.forEach((label, labelIndex) => {
    const trimmed = label.trim();
    if (descriptionCounts.get(trimmed) !== 1) return;

    const ref = refs.find(r => !usedRefIds.has(r.id) && r.description.trim() === trimmed);
    if (!ref) return;

    usedRefIds.add(ref.id);
    matchedLabelIndices.add(labelIndex);
    bindings.push({ ref, labelIndex, matchedBy: 'text' });
  });

  const overlap = Math.min(svgLabels.length, refs.length);
  for (let labelIndex = 0; labelIndex < overlap; labelIndex++) {
    if (matchedLabelIndices.has(labelIndex)) continue;
    const ref = refs[labelIndex];
    if (!ref || usedRefIds.has(ref.id)) continue;

    usedRefIds.add(ref.id);
    bindings.push({ ref, labelIndex, matchedBy: 'ordinal' });
  }

  return bindings.sort((a, b) => a.labelIndex - b.labelIndex);
}

/**
 * Re-resolves refs' file paths against the current file list. Persisted
 * diagrams snapshot resolvedPath at generation time, which goes stale once
 * files are renamed/removed — this recomputes it at revival time.
 */
export function resolveRefPaths(refs: DiagramRef[], availablePaths: string[]): DiagramRef[] {
  return refs.map(ref => ({
    ...ref,
    resolvedPath: resolveFilePath(ref.filePath, availablePaths).resolved,
  }));
}
