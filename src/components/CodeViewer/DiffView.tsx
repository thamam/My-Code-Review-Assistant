import React, { useMemo } from 'react';
import { computeDiff, DiffLine } from '../../utils/diffUtils';
import clsx from 'clsx';
import { LineMarker } from './LineMarker';
import { usePR } from '../../contexts/PRContext';
import { getActiveSection } from '../../utils/walkthroughUtils';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { Tag } from 'lucide-react';
import { AnnotationInput } from './AnnotationInput';
import { getLanguage, HighlightedText } from './syntaxHelpers';
import { useViewportTracker } from './useViewportTracker';
import { useLineInteractions } from './useLineInteractions';
import { useLineRefCallback } from './useLineRefCallback';
import { coordAttr, coordsEqual, type LineCoord, type LineEntry } from './lineCoord';
import { LineGutterIndicator } from './LineGutterIndicator';

interface DiffViewProps {
  oldContent?: string;
  newContent: string;
  filePath: string;
  onViewportChange: (file: string, start: number, end: number) => void;
}

function coordForLine(line: DiffLine): LineCoord | null {
  if (line.newLineNumber) return { side: 'new', line: line.newLineNumber };
  if (line.oldLineNumber) return { side: 'old', line: line.oldLineNumber };
  return null;
}

export const DiffView: React.FC<DiffViewProps> = ({ oldContent, newContent, filePath, onViewportChange }) => {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const { handleLineVisibility } = useViewportTracker(filePath, onViewportChange);
  const { walkthrough, activeSectionId, selectionState, focusedLocation, isFlashActive } = usePR();
  const interactions = useLineInteractions({ filePath });
  const getLineRef = useLineRefCallback(filePath);

  const language = getLanguage(filePath);

  const lineEntries = useMemo<LineEntry[]>(() =>
    diffLines.flatMap(line => {
      const coord = coordForLine(line);
      return coord ? [{ coord, content: line.content }] : [];
    }),
    [diffLines]
  );

  const highlights = useMemo(() => {
      if (!activeSectionId || !walkthrough) return [];
      const section = getActiveSection(walkthrough, activeSectionId);
      return section?.highlights?.filter(h => arePathsEquivalent(h.file, filePath)) || [];
  }, [walkthrough, activeSectionId, filePath]);

  const isLineHighlighted = (newLineNum?: number) => {
      if (!newLineNum) return false;
      return highlights.some(h => newLineNum >= h.lines[0] && newLineNum <= h.lines[1]);
  };

  const getHighlightNote = (newLineNum?: number) => {
      if (!newLineNum) return null;
      return highlights.find(h => newLineNum >= h.lines[0] && newLineNum <= h.lines[1])?.note;
  };

  return (
    <div
      className="font-mono text-xs md:text-sm bg-gray-950 min-h-full"
      onMouseUp={() => interactions.captureSelection(lineEntries)}
    >
      {diffLines.map((line, idx) => {
        const isAdded = line.type === 'add';
        const isRemoved = line.type === 'remove';
        const isHighlighted = isLineHighlighted(line.newLineNumber);
        const coord = coordForLine(line);
        const focusedSide = focusedLocation?.side ?? 'new';
        const isFlashing = isFlashActive && !!focusedLocation && !!coord && arePathsEquivalent(focusedLocation.file, filePath) &&
                           coord.side === focusedSide && coord.line === focusedLocation.line;
        const note = getHighlightNote(line.newLineNumber);
        const showNote = note && line.newLineNumber && highlights.find(h => h.lines[0] === line.newLineNumber);

        const lineAnnotations = coord ? interactions.annotationsAt(coord) : [];
        const hasMarker = lineAnnotations.some(a => a.type === 'marker');
        const hasLabel = lineAnnotations.some(a => a.type === 'label');
        const isHovered = !!coord && !!interactions.hoveredCoord && coordsEqual(interactions.hoveredCoord, coord);
        const isCreatingLabel = !!coord && !!interactions.creatingLabelCoord && coordsEqual(interactions.creatingLabelCoord, coord);

        const isSelected = !!coord && !!selectionState && selectionState.file === filePath &&
                           !!selectionState.selectedCoords?.has(coordAttr(coord));

        return (
          <div
            key={`${filePath}-${idx}`}
            ref={coord ? getLineRef(coord) : undefined}
            className={clsx(
              "flex relative group hover:bg-white/5 transition-colors duration-200",
              isAdded && "bg-green-900/20",
              isRemoved && "bg-red-900/20",
              isHighlighted && "bg-purple-900/30 ring-1 ring-purple-500/50 z-10",
              isFlashing && "bg-blue-600/30 ring-1 ring-blue-500/50 z-20"
            )}
            data-line-number={line.newLineNumber}
            data-line-coord={coord ? coordAttr(coord) : undefined}
          >
            {line.newLineNumber && (
              <LineMarker
                lineId={`${filePath}:${line.newLineNumber}`}
                lineNumber={line.newLineNumber}
                onVisible={handleLineVisibility}
              />
            )}

            {/* Old Line Number */}
            <div
              className={clsx(
                  "w-12 text-right pr-3 text-gray-600 select-none border-r py-0.5 relative transition-all duration-150 cursor-pointer hover:bg-gray-800/50",
                  isSelected
                      ? "bg-blue-900/30 text-blue-200 border-blue-500 border-l-4 font-bold"
                      : "bg-gray-900/50 border-gray-800 border-l-4 border-l-transparent"
              )}
              onClick={(e) => coord && interactions.handleInteraction(e, coord)}
              onContextMenu={(e) => coord && interactions.handleContextMenu(e, coord)}
            >
              {line.oldLineNumber || ''}
            </div>

            {/* New Line Number */}
            <div
                className={clsx(
                    "w-12 text-right pr-3 select-none border-r py-0.5 relative cursor-pointer hover:text-gray-400 hover:bg-gray-800/50 transition-all duration-150 z-20",
                    isSelected
                        ? "bg-blue-900/30 text-blue-200 border-blue-500 font-bold"
                        : "bg-gray-900/50 border-gray-800 text-gray-600"
                )}
                onClick={(e) => coord && interactions.handleInteraction(e, coord)}
                onContextMenu={(e) => coord && interactions.handleContextMenu(e, coord)}
                onMouseEnter={() => coord && interactions.setHoveredCoord(coord)}
                onMouseLeave={() => interactions.setHoveredCoord(null)}
                title="Left-Click: Marker | Right-Click / Ctrl+Click: Label"
            >
              {line.newLineNumber || ''}

              <LineGutterIndicator size={8} isHovered={isHovered} isSelected={!!isSelected} hasMarker={hasMarker} hasLabel={hasLabel} />
            </div>

            <div className="w-6 text-center select-none text-gray-500 py-0.5">
              {isAdded && '+'}
              {isRemoved && '-'}
            </div>

            <div
                className={clsx("flex-1 whitespace-pre py-0.5 pl-2 relative transition-colors duration-150 cursor-text",
                    isAdded && "text-green-100",
                    isRemoved && "text-red-200 line-through opacity-60",
                    !isAdded && !isRemoved && "text-gray-300",
                    isSelected && "bg-blue-500/10"
                )}
            >
              {isCreatingLabel && (
                  <AnnotationInput
                    onSave={interactions.handleSaveLabel}
                    onCancel={interactions.cancelLabelCreation}
                  />
              )}

              {line.diffParts ? (
                  <span>
                      {line.diffParts
                        .filter(part => {
                            if (isRemoved) return !part.added;
                            if (isAdded) return !part.removed;
                            return true;
                        })
                        .map((part, i) => (
                          <span key={i} className={clsx(
                              part.added && isAdded && "bg-green-600/50 font-bold text-white",
                              part.removed && isRemoved && "bg-red-700/50 font-bold text-white decoration-2",
                              !part.added && !part.removed && "opacity-80"
                          )}>
                              {part.value}
                          </span>
                      ))}
                  </span>
              ) : (
                  <HighlightedText text={line.content} language={language} />
              )}

              <div className="absolute right-4 top-0 flex gap-2 pointer-events-none">
                 {lineAnnotations.map(a => (
                     <span key={a.id} className={clsx(
                         "text-[10px] px-1.5 rounded flex items-center gap-1 opacity-75 pointer-events-auto hover:opacity-100 cursor-help",
                         a.type === 'label' ? "bg-yellow-900 text-yellow-200" : "bg-blue-900 text-blue-200"
                     )} title={a.title}>
                         {a.type === 'label' ? <Tag size={8} /> : '@'} {a.title}
                     </span>
                 ))}
              </div>
            </div>

             {showNote && (
                 <div className="absolute right-4 top-0 bg-purple-600 text-white px-2 py-0.5 text-xs rounded shadow-lg opacity-90 pointer-events-none select-none">
                     {note}
                 </div>
             )}
          </div>
        );
      })}
    </div>
  );
};
