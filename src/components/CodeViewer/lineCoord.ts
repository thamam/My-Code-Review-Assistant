import type { Annotation } from '../../types/domain';

/**
 * Addressable coordinate for a rendered code line. Normal/added lines are
 * addressed by their new-file line number; deleted lines (which have no
 * new-file line) are addressed by their old-file line number.
 */
export type LineSide = 'old' | 'new';

export interface LineCoord {
  side: LineSide;
  line: number;
}

/** One rendered row: its coordinate plus the raw source text at that row. */
export interface LineEntry {
  coord: LineCoord;
  content: string;
}

export function coordAttr(coord: LineCoord): string {
  return `${coord.side}:${coord.line}`;
}

export function parseCoordAttr(value: string | null | undefined): LineCoord | null {
  if (!value) return null;
  const sepIdx = value.indexOf(':');
  if (sepIdx === -1) return null;
  const side = value.slice(0, sepIdx);
  const line = parseInt(value.slice(sepIdx + 1), 10);
  if (side !== 'old' && side !== 'new') return null;
  if (Number.isNaN(line)) return null;
  return { side, line };
}

export function coordsEqual(a: LineCoord, b: LineCoord): boolean {
  return a.side === b.side && a.line === b.line;
}

/** Legacy annotations predate the `side` field — they addressed new-file lines only. */
export function annotationMatchesCoord(annotation: Annotation, coord: LineCoord): boolean {
  return (annotation.side ?? 'new') === coord.side && annotation.line === coord.line;
}

/**
 * Resolves a mouse selection spanning two coordinates into the ordered slice
 * of rendered rows between them (inclusive), using render order rather than
 * numeric comparison so old/new coordinates interleave correctly and deleted
 * lines caught in the middle of a selection contribute their content.
 */
export function resolveSelectionRange(
  lines: LineEntry[],
  startCoord: LineCoord,
  endCoord: LineCoord
): { startLine: number; endLine: number; content: string; startSide: LineSide; endSide: LineSide; coords: LineCoord[] } | null {
  const startIdx = lines.findIndex(l => coordsEqual(l.coord, startCoord));
  const endIdx = lines.findIndex(l => coordsEqual(l.coord, endCoord));
  if (startIdx === -1 || endIdx === -1) return null;

  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const slice = lines.slice(lo, hi + 1);

  return {
    startLine: slice[0].coord.line,
    endLine: slice[slice.length - 1].coord.line,
    content: slice.map(l => l.content).join('\n'),
    startSide: slice[0].coord.side,
    endSide: slice[slice.length - 1].coord.side,
    coords: slice.map(l => l.coord),
  };
}

/** Pure decision for what a click on a line should do. */
export function resolveInteractionKind(
  e: { ctrlKey: boolean; metaKey: boolean },
  hasCollapsedSelection: boolean
): 'label' | 'marker' | 'none' {
  if (e.ctrlKey || e.metaKey) return 'label';
  if (hasCollapsedSelection) return 'marker';
  return 'none';
}
