import React, { useMemo, useCallback, useState } from 'react';
import { computeDiff, DiffLine } from '../../utils/diffUtils';
import clsx from 'clsx';
import { LineMarker } from './LineMarker';
import { usePR } from '../../contexts/PRContext';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { MapPin, MessageSquare, Tag } from 'lucide-react';
import Prism from 'prismjs';

interface DiffViewProps {
  oldContent?: string;
  newContent: string;
  filePath: string;
  onViewportChange: (file: string, start: number, end: number) => void;
}

// Helper to determine Prism language
const getLanguage = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript'; // Prism often uses 'javascript' for TS basics in lightweight setups, or 'typescript' if loaded
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    return 'clike';
};

// Helper to render Prism tokens to React nodes
const renderToken = (token: string | Prism.Token, key: number): React.ReactNode => {
    if (typeof token === 'string') return token;
    
    const className = `token ${token.type} ${token.alias || ''}`;
    
    const content = Array.isArray(token.content) 
        ? token.content.map((t, i) => renderToken(t, i)) 
        : token.content.toString();

    return (
        <span key={key} className={className}>
            {content}
        </span>
    );
};

const HighlightedText: React.FC<{ text: string, language: string }> = React.memo(({ text, language }) => {
    // If text is extremely long, fallback to plain text to prevent freeze
    if (text.length > 500) return <>{text}</>;

    try {
        const grammar = Prism.languages[language] || Prism.languages.clike;
        if (!grammar) return <>{text}</>;
        
        const tokens = Prism.tokenize(text, grammar);
        return (
            <>
                {tokens.map((token, i) => renderToken(token, i))}
            </>
        );
    } catch (e) {
        return <>{text}</>;
    }
});

export const DiffView: React.FC<DiffViewProps> = ({ oldContent, newContent, filePath, onViewportChange }) => {
  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const visibleLines = React.useRef(new Set<number>());
  const updateTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { walkthrough, activeSectionId, selectionState, setSelectionState, annotations, addAnnotation, removeAnnotation } = usePR();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const fileAnnotations = annotations.filter(a => a.file === filePath);
  const language = getLanguage(filePath);

  const handleLineVisibility = (lineNumber: number, isVisible: boolean) => {
    if (isVisible) visibleLines.current.add(lineNumber);
    else visibleLines.current.delete(lineNumber);

    if (updateTimeout.current) clearTimeout(updateTimeout.current);

    updateTimeout.current = setTimeout(() => {
      if (visibleLines.current.size === 0) return;
      const lines = Array.from(visibleLines.current).sort((a: number, b: number) => a - b);
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

  const handleGutterClick = (e: React.MouseEvent, lineNum: number) => {
      e.stopPropagation();
      e.preventDefault();
      // Toggle Marker
      const existingMarker = fileAnnotations.find(a => a.line === lineNum && a.type === 'marker');
      if (existingMarker) {
          removeAnnotation(existingMarker.id);
      } else {
          addAnnotation(filePath, lineNum, 'marker');
      }
  };

  const handleGutterContextMenu = (e: React.MouseEvent, lineNum: number) => {
      e.preventDefault();
      e.stopPropagation();
      // Add Label
      // We use a small timeout to ensure no other events interfere
      setTimeout(() => {
          const note = prompt("Enter a label/note for line " + lineNum + ":");
          if (note) {
              addAnnotation(filePath, lineNum, 'label', note);
          }
      }, 10);
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
        
        // VISUAL INDICATOR FOR SELECTION
        const isSelected = line.newLineNumber && selectionState && selectionState.file === filePath && 
                           line.newLineNumber >= selectionState.startLine && line.newLineNumber <= selectionState.endLine;

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
            <div className={clsx(
                "w-12 text-right pr-3 text-gray-600 select-none border-r py-0.5 relative transition-all duration-150",
                isSelected 
                    ? "bg-blue-900/30 text-blue-200 border-blue-500 border-l-4 font-bold" 
                    : "bg-gray-900/50 border-gray-800 border-l-4 border-l-transparent"
            )}>
              {line.oldLineNumber || ''}
            </div>
            
            <div 
                className={clsx(
                    "w-12 text-right pr-3 select-none border-r py-0.5 relative cursor-pointer hover:text-gray-400 transition-all duration-150 z-20",
                    isSelected 
                        ? "bg-blue-900/30 text-blue-200 border-blue-500 font-bold" 
                        : "bg-gray-900/50 border-gray-800 text-gray-600"
                )}
                onClick={(e) => line.newLineNumber && handleGutterClick(e, line.newLineNumber)}
                onContextMenu={(e) => line.newLineNumber && handleGutterContextMenu(e, line.newLineNumber)}
                onMouseEnter={() => line.newLineNumber && setHoveredLine(line.newLineNumber)}
                onMouseLeave={() => setHoveredLine(null)}
                title="Left-click: Marker | Right-click: Label"
            >
              {line.newLineNumber || ''}
              
              {/* Indicators */}
              {line.newLineNumber && hoveredLine === line.newLineNumber && !hasMarker && !hasLabel && !isSelected && (
                  <div className="absolute left-1 top-1 text-gray-500 opacity-50 pointer-events-none"><MapPin size={8} /></div>
              )}
              {(hasMarker || hasLabel) && (
                 <div className="absolute left-1 top-1 text-blue-400 pointer-events-none">
                    {hasLabel ? <MessageSquare size={8} className="text-yellow-400" /> : <MapPin size={8} />}
                 </div>
              )}
            </div>

            <div className="w-6 text-center select-none text-gray-500 py-0.5">
              {isAdded && '+'}
              {isRemoved && '-'}
            </div>

            <div className={clsx("flex-1 whitespace-pre py-0.5 pl-2 relative transition-colors duration-150", 
                isAdded && "text-green-100", // Brighter text for readability on green bg
                isRemoved && "text-red-200 line-through opacity-60",
                !isAdded && !isRemoved && "text-gray-300",
                isSelected && "bg-blue-500/10"
            )}>
              {/* Word-level diff rendering OR Syntax Highlighting */}
              {line.diffParts ? (
                  <span>
                      {line.diffParts.map((part, i) => (
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
              
              {/* Annotations */}
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