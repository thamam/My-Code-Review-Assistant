import { useCallback, useMemo, useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import {
  annotationMatchesCoord,
  parseCoordAttr,
  resolveInteractionKind,
  resolveSelectionRange,
  type LineCoord,
  type LineEntry,
} from './lineCoord';

export type { LineCoord, LineEntry } from './lineCoord';

/**
 * Shared per-line review interaction machinery for DiffView and SourceView:
 * marker toggling, label create/save, context-menu, and DOM-selection capture.
 * Both views render their own rows/gutters; this hook owns the behavior.
 */
export function useLineInteractions({ filePath }: { filePath: string }) {
  const { annotations, addAnnotation, removeAnnotation, setSelectionState } = usePR();
  const [hoveredCoord, setHoveredCoord] = useState<LineCoord | null>(null);
  const [creatingLabelCoord, setCreatingLabelCoord] = useState<LineCoord | null>(null);

  const fileAnnotations = useMemo(
    () => annotations.filter(a => a.file === filePath),
    [annotations, filePath]
  );

  const annotationsAt = useCallback(
    (coord: LineCoord) => fileAnnotations.filter(a => annotationMatchesCoord(a, coord)),
    [fileAnnotations]
  );

  const toggleMarker = useCallback((coord: LineCoord) => {
    const existing = fileAnnotations.find(a => annotationMatchesCoord(a, coord) && a.type === 'marker');
    if (existing) {
      removeAnnotation(existing.id);
    } else {
      addAnnotation(filePath, coord.line, 'marker', undefined, coord.side);
    }
  }, [fileAnnotations, filePath, addAnnotation, removeAnnotation]);

  const startLabelCreation = useCallback((coord: LineCoord) => {
    setCreatingLabelCoord(coord);
  }, []);

  const cancelLabelCreation = useCallback(() => setCreatingLabelCoord(null), []);

  const handleSaveLabel = useCallback((text: string) => {
    if (creatingLabelCoord) {
      addAnnotation(filePath, creatingLabelCoord.line, 'label', text, creatingLabelCoord.side);
      setCreatingLabelCoord(null);
    }
  }, [creatingLabelCoord, filePath, addAnnotation]);

  const handleInteraction = useCallback((e: React.MouseEvent, coord: LineCoord) => {
    e.stopPropagation();
    const selection = window.getSelection();
    const kind = resolveInteractionKind(e, !selection || selection.isCollapsed);
    if (kind === 'label') {
      e.preventDefault();
      startLabelCreation(coord);
    } else if (kind === 'marker') {
      toggleMarker(coord);
    }
  }, [startLabelCreation, toggleMarker]);

  const handleContextMenu = useCallback((e: React.MouseEvent, coord: LineCoord) => {
    e.preventDefault();
    e.stopPropagation();
    startLabelCreation(coord);
  }, [startLabelCreation]);

  // DOM-walking selection capture: resolves the mouse selection's start/end
  // elements to coordinates via the data-line-coord attribute, then uses
  // `lines` (the view's full render-order list) to build the captured range
  // so deleted lines caught mid-selection still contribute their content.
  const captureSelection = useCallback((lines: LineEntry[]) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as HTMLElement);
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : (range.endContainer as HTMLElement);

    const findCoord = (node: Node | null): LineCoord | null => {
      let curr = node as HTMLElement | null;
      while (curr && curr.getAttribute) {
        const coord = parseCoordAttr(curr.getAttribute('data-line-coord'));
        if (coord) return coord;
        curr = curr.parentElement;
      }
      return null;
    };

    const startCoord = findCoord(startNode);
    const endCoord = findCoord(endNode);
    if (!startCoord || !endCoord) return;

    const resolved = resolveSelectionRange(lines, startCoord, endCoord);
    if (!resolved) return;

    setSelectionState({ file: filePath, ...resolved });
  }, [filePath, setSelectionState]);

  return {
    annotationsAt,
    hoveredCoord,
    setHoveredCoord,
    creatingLabelCoord,
    handleSaveLabel,
    cancelLabelCreation,
    handleInteraction,
    handleContextMenu,
    captureSelection,
  };
}
