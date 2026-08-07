import { describe, it, expect } from 'vitest';
import {
  coordAttr,
  parseCoordAttr,
  coordsEqual,
  annotationMatchesCoord,
  resolveSelectionRange,
  resolveInteractionKind,
  type LineEntry,
} from '../../../components/CodeViewer/lineCoord';
import type { Annotation } from '../../../types';

describe('coordAttr / parseCoordAttr', () => {
  it('round-trips a new-side coordinate', () => {
    const coord = { side: 'new' as const, line: 42 };
    expect(parseCoordAttr(coordAttr(coord))).toEqual(coord);
  });

  it('round-trips an old-side coordinate', () => {
    const coord = { side: 'old' as const, line: 7 };
    expect(parseCoordAttr(coordAttr(coord))).toEqual(coord);
  });

  it('returns null for missing or malformed values', () => {
    expect(parseCoordAttr(null)).toBeNull();
    expect(parseCoordAttr(undefined)).toBeNull();
    expect(parseCoordAttr('')).toBeNull();
    expect(parseCoordAttr('sideways')).toBeNull();
    expect(parseCoordAttr('new:notanumber')).toBeNull();
    expect(parseCoordAttr('future:5')).toBeNull();
  });
});

describe('coordsEqual', () => {
  it('matches same side and line', () => {
    expect(coordsEqual({ side: 'new', line: 3 }, { side: 'new', line: 3 })).toBe(true);
  });

  it('rejects same line on different sides', () => {
    expect(coordsEqual({ side: 'new', line: 3 }, { side: 'old', line: 3 })).toBe(false);
  });

  it('rejects same side with different lines', () => {
    expect(coordsEqual({ side: 'new', line: 3 }, { side: 'new', line: 4 })).toBe(false);
  });
});

describe('annotationMatchesCoord', () => {
  const base: Annotation = { id: '1', file: 'f.ts', line: 5, type: 'marker', timestamp: 0 };

  it('matches a new-line coordinate on an annotation with explicit side', () => {
    const a: Annotation = { ...base, side: 'new' };
    expect(annotationMatchesCoord(a, { side: 'new', line: 5 })).toBe(true);
  });

  it('matches an old-line coordinate on an annotation with explicit side', () => {
    const a: Annotation = { ...base, side: 'old' };
    expect(annotationMatchesCoord(a, { side: 'old', line: 5 })).toBe(true);
    expect(annotationMatchesCoord(a, { side: 'new', line: 5 })).toBe(false);
  });

  it('defaults legacy annotations without a side to new', () => {
    const legacy: Annotation = { ...base };
    delete (legacy as any).side;
    expect(annotationMatchesCoord(legacy, { side: 'new', line: 5 })).toBe(true);
    expect(annotationMatchesCoord(legacy, { side: 'old', line: 5 })).toBe(false);
  });

  it('does not match a different line number', () => {
    const a: Annotation = { ...base, side: 'new' };
    expect(annotationMatchesCoord(a, { side: 'new', line: 6 })).toBe(false);
  });
});

describe('resolveSelectionRange', () => {
  const lines: LineEntry[] = [
    { coord: { side: 'new', line: 1 }, content: 'one' },
    { coord: { side: 'new', line: 2 }, content: 'two' },
    { coord: { side: 'old', line: 5 }, content: 'deleted-three' },
    { coord: { side: 'new', line: 3 }, content: 'four' },
    { coord: { side: 'new', line: 4 }, content: 'five' },
  ];

  it('resolves a simple same-side forward range', () => {
    const result = resolveSelectionRange(lines, { side: 'new', line: 1 }, { side: 'new', line: 2 });
    expect(result).toEqual({ startLine: 1, endLine: 2, content: 'one\ntwo' });
  });

  it('resolves a reversed selection (end before start in the DOM)', () => {
    const result = resolveSelectionRange(lines, { side: 'new', line: 4 }, { side: 'new', line: 3 });
    expect(result).toEqual({ startLine: 3, endLine: 4, content: 'four\nfive' });
  });

  it('includes a deleted (old-side) line caught between two new-side anchors', () => {
    const result = resolveSelectionRange(lines, { side: 'new', line: 2 }, { side: 'new', line: 3 });
    expect(result).toEqual({ startLine: 2, endLine: 3, content: 'two\ndeleted-three\nfour' });
  });

  it('resolves a selection anchored entirely on a deleted line', () => {
    const result = resolveSelectionRange(lines, { side: 'old', line: 5 }, { side: 'old', line: 5 });
    expect(result).toEqual({ startLine: 5, endLine: 5, content: 'deleted-three' });
  });

  it('returns null when a coordinate is not present in the rendered lines', () => {
    expect(resolveSelectionRange(lines, { side: 'new', line: 1 }, { side: 'new', line: 99 })).toBeNull();
    expect(resolveSelectionRange(lines, { side: 'old', line: 99 }, { side: 'new', line: 1 })).toBeNull();
  });
});

describe('resolveInteractionKind', () => {
  it('prefers label creation on ctrl-click regardless of selection', () => {
    expect(resolveInteractionKind({ ctrlKey: true, metaKey: false }, true)).toBe('label');
    expect(resolveInteractionKind({ ctrlKey: true, metaKey: false }, false)).toBe('label');
  });

  it('prefers label creation on cmd-click regardless of selection', () => {
    expect(resolveInteractionKind({ ctrlKey: false, metaKey: true }, true)).toBe('label');
  });

  it('toggles a marker on a plain click with a collapsed selection', () => {
    expect(resolveInteractionKind({ ctrlKey: false, metaKey: false }, true)).toBe('marker');
  });

  it('does nothing on a plain click while text is actively selected', () => {
    expect(resolveInteractionKind({ ctrlKey: false, metaKey: false }, false)).toBe('none');
  });
});
