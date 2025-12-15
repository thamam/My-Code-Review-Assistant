import React, { useMemo, useCallback, useState } from 'react';
import { computeDiff, DiffLine } from '../../utils/diffUtils';
import clsx from 'clsx';
import { LineMarker } from './LineMarker';
import { usePR } from '../../contexts/PRContext';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { MapPin, MessageSquare, Tag } from 'lucide-react';

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
  const { walkthrough, activeSectionId, setSelectionState, annotations, addAnnotation } = usePR();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const fileAnnotations = annotations.filter(a => a.file === filePath);

  const handleLineVisibility = (lineNumber: number, isVisible: boolean) => {
    if (isVisible) visibleLines.current.add(lineNumber);
    else visibleLines.current.delete(lineNumber);

    if (updateTimeout.current) clearTimeout(updateTimeout.current);

    updateTimeout.current = setTimeout(() => {
      if (visibleLines.current.size === 0) return;
      const lines = Array.from(visibleLines.current).sort((a, b) => a - b);
      if (lines.length > 0) onViewportChange(filePath, lines[0], lines[lines.length - 1]);
    }, 100);
  };

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;

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
    }
  }, [diffLines, filePath, setSelectionState]);

  const highlights = useMemo(() => {
      if (!activeSectionId || !walkthrough) return [];
      const section = walkthrough.sections.find(s => s.id === activeSectionId);
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

  const handleGutterClick = (lineNum: number) => {
      addAnnotation(filePath, lineNum, 'marker');
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
        
        const lineAnnotations = line.newLineNumber ? fileAnnotations.filter(a => a.line === line.newLineNumber) : [];
        const hasMarker = lineAnnotations.some(a => a.type === 'marker');
        const hasLabel = lineAnnotations.some(a => a.type === 'label');

        return (
          <div 
            key={`${filePath}-${idx}`} 
            className={clsx(
              "flex relative group hover:bg-white/5",
              isAdded && "bg-green-900/20",
              isRemoved && "bg-red-900/20",
              isHighlighted && "bg-purple-900/30 ring-1 ring-purple-500/50 z-10"
            )}
            data-line-number={line.newLineNumber}
          >
            {line.newLineNumber && (
              <LineMarker 
                lineId={`${filePath}:${line.newLineNumber}`} 
                lineNumber={line.newLineNumber} 
                onVisible={handleLineVisibility} 
              />
            )}

            {/* Line Numbers with Gutter Actions */}
            <div className="w-12 text-right pr-3 text-gray-600 select-none bg-gray-900/50 border-r border-gray-800 py-0.5 relative">
              {line.oldLineNumber || ''}
            </div>
            <div 
                className="w-12 text-right pr-3 text-gray-600 select-none bg-gray-900/50 border-r border-gray-800 py-0.5 relative cursor-pointer hover:text-gray-400"
                onClick={() => line.newLineNumber && handleGutterClick(line.newLineNumber)}
                onMouseEnter={() => line.newLineNumber && setHoveredLine(line.newLineNumber)}
                onMouseLeave={() => setHoveredLine(null)}
            >
              {line.newLineNumber || ''}
              {line.newLineNumber && hoveredLine === line.newLineNumber && !hasMarker && !hasLabel && (
                  <div className="absolute left-1 top-1 text-gray-500 opacity-50"><MapPin size={8} /></div>
              )}
              {(hasMarker || hasLabel) && (
                 <div className="absolute left-1 top-1 text-blue-400">
                    {hasLabel ? <MessageSquare size={8} className="text-yellow-400" /> : <MapPin size={8} />}
                 </div>
              )}
            </div>

            <div className="w-6 text-center select-none text-gray-500 py-0.5">
              {isAdded && '+'}
              {isRemoved && '-'}
            </div>

            <div className={clsx("flex-1 whitespace-pre py-0.5 pl-2 relative", 
                isAdded && "text-green-200",
                isRemoved && "text-red-300 line-through opacity-60",
                !isAdded && !isRemoved && "text-gray-300"
            )}>
              {/* Word-level diff rendering */}
              {line.diffParts ? (
                  <span>
                      {line.diffParts.map((part, i) => (
                          <span key={i} className={clsx(
                              part.added && isAdded && "bg-green-700/50 font-bold",
                              part.removed && isRemoved && "bg-red-700/50 font-bold text-red-100 decoration-2",
                              !part.added && !part.removed && "opacity-70"
                          )}>
                              {part.value}
                          </span>
                      ))}
                  </span>
              ) : (
                  line.content
              )}
              
              {/* Annotations */}
              <div className="absolute right-4 top-0 flex gap-2">
                 {lineAnnotations.map(a => (
                     <span key={a.id} className={clsx(
                         "text-[10px] px-1.5 rounded flex items-center gap-1 opacity-75 hover:opacity-100 cursor-help",
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