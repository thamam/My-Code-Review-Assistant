import React, { useMemo, useCallback } from 'react';
import { computeDiff, DiffLine } from '../../utils/diffUtils';
import clsx from 'clsx';
import { LineMarker } from './LineMarker';
import { usePR } from '../../contexts/PRContext';

interface DiffViewProps {
  oldContent?: string;
  newContent: string;
  filePath: string;
  onViewportChange: (file: string, start: number, end: number) => void;
}

export const DiffView: React.FC<DiffViewProps> = ({ oldContent, newContent, filePath, onViewportChange }) => {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const visibleLines = React.useRef(new Set<number>());
  const updateTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { walkthrough, activeSectionId, setSelectionState } = usePR();

  const handleLineVisibility = (lineNumber: number, isVisible: boolean) => {
    if (isVisible) {
      visibleLines.current.add(lineNumber);
    } else {
      visibleLines.current.delete(lineNumber);
    }

    if (updateTimeout.current) clearTimeout(updateTimeout.current);

    updateTimeout.current = setTimeout(() => {
      if (visibleLines.current.size === 0) return;
      
      const lines = Array.from(visibleLines.current).sort((a: number, b: number) => a - b);
      if (lines.length > 0) {
        onViewportChange(filePath, lines[0], lines[lines.length - 1]);
      }
    }, 100);
  };

  // Handle Text Selection to create "User Markers"
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      // Don't clear immediately to allow click-to-copy, but if needed we can setSelectionState(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;

    // Helper to find closest line number attribute
    const findLineNumber = (node: Node | null): number | null => {
      let curr = node as HTMLElement;
      while (curr && curr.getAttribute) {
        const line = curr.getAttribute('data-line-number');
        if (line) return parseInt(line, 10);
        curr = curr.parentElement as HTMLElement;
      }
      return null;
    };

    const startLine = findLineNumber(startNode);
    const endLine = findLineNumber(endNode);

    if (startLine !== null && endLine !== null) {
      const actualStart = Math.min(startLine, endLine);
      const actualEnd = Math.max(startLine, endLine);
      
      // Extract content from diffLines based on line numbers
      // This is cleaner than extracting from DOM which might contain line numbers/markers
      const selectedContent = diffLines
        .filter(l => l.newLineNumber && l.newLineNumber >= actualStart && l.newLineNumber <= actualEnd)
        .map(l => l.content)
        .join('\n');

      setSelectionState({
        file: filePath,
        startLine: actualStart,
        endLine: actualEnd,
        content: selectedContent
      });
      
      console.log(`Selection: Lines ${actualStart}-${actualEnd}`);
    }
  }, [diffLines, filePath, setSelectionState]);


  // Check for highlights from walkthrough
  const highlights = useMemo(() => {
      if (!activeSectionId || !walkthrough) return [];
      const section = walkthrough.sections.find(s => s.id === activeSectionId);
      return section?.highlights?.filter(h => h.file === filePath) || [];
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
      onMouseUp={handleMouseUp}
    >
      {diffLines.map((line, idx) => {
        const isAdded = line.type === 'add';
        const isRemoved = line.type === 'remove';
        const isHighlighted = isLineHighlighted(line.newLineNumber);
        const note = getHighlightNote(line.newLineNumber);
        const showNote = note && line.newLineNumber && highlights.find(h => h.lines[0] === line.newLineNumber); 

        return (
          <div 
            key={`${filePath}-${idx}`} 
            className={clsx(
              "flex relative group hover:bg-white/5",
              isAdded && "bg-green-900/20",
              isRemoved && "bg-red-900/20",
              isHighlighted && "bg-purple-900/30 ring-1 ring-purple-500/50 z-10"
            )}
            data-line-number={line.newLineNumber} // Data attribute for markers
          >
            {/* Markers for tracking viewport */}
            {line.newLineNumber && (
              <LineMarker 
                lineId={`${filePath}:${line.newLineNumber}`} 
                lineNumber={line.newLineNumber} 
                onVisible={handleLineVisibility} 
              />
            )}

            {/* Line Numbers */}
            <div className="w-12 text-right pr-3 text-gray-600 select-none bg-gray-900/50 border-r border-gray-800 py-0.5">
              {line.oldLineNumber || ''}
            </div>
            <div className="w-12 text-right pr-3 text-gray-600 select-none bg-gray-900/50 border-r border-gray-800 py-0.5">
              {line.newLineNumber || ''}
            </div>

            {/* Marker Symbols */}
            <div className="w-6 text-center select-none text-gray-500 py-0.5">
              {isAdded && '+'}
              {isRemoved && '-'}
            </div>

            {/* Code Content */}
            <div className={clsx("flex-1 whitespace-pre py-0.5 pl-2", 
                isAdded && "text-green-200",
                isRemoved && "text-red-300 line-through opacity-60",
                !isAdded && !isRemoved && "text-gray-300"
            )}>
              {line.content}
            </div>

             {/* Inline Walkthrough Note */}
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