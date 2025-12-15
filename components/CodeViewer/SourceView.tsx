import React, { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import { usePR } from '../../contexts/PRContext';
import { Annotation } from '../../types';
import { MessageSquare, MapPin, Tag } from 'lucide-react';
import clsx from 'clsx';

interface SourceViewProps {
  content: string;
  filePath: string;
}

export const SourceView: React.FC<SourceViewProps> = ({ content, filePath }) => {
  const codeRef = useRef<HTMLElement>(null);
  const { annotations, addAnnotation, removeAnnotation, selectionState, setSelectionState } = usePR();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [content, filePath]);

  const fileAnnotations = annotations.filter(a => a.file === filePath);
  
  const getLanguage = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.json')) return 'json';
    return 'clike';
  };

  const handleLineClick = (e: React.MouseEvent, lineNum: number) => {
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

  const handleLineContextMenu = (e: React.MouseEvent, lineNum: number) => {
      e.preventDefault();
      e.stopPropagation();
      // Add Label
      setTimeout(() => {
          const note = prompt("Enter a label/note for line " + lineNum + ":");
          if (note) {
              addAnnotation(filePath, lineNum, 'label', note);
          }
      }, 10);
  };

  const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
      const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;

      const findLineNumber = (node: Node | null): number | null => {
        let curr = node as HTMLElement;
        while (curr) {
          if (curr.getAttribute && curr.getAttribute('data-line-number')) {
               return parseInt(curr.getAttribute('data-line-number')!, 10);
          }
          curr = curr.parentElement as HTMLElement;
        }
        return null;
      };

      const startLine = findLineNumber(startNode);
      const endLine = findLineNumber(endNode);

      if (startLine !== null && endLine !== null) {
          const actualStart = Math.min(startLine, endLine);
          const actualEnd = Math.max(startLine, endLine);
          const lines = content.split('\n');
          const selectedText = lines.slice(actualStart - 1, actualEnd).join('\n');
          
          setSelectionState({
              file: filePath,
              startLine: actualStart,
              endLine: actualEnd,
              content: selectedText
          });
      }
  };

  const lines = content.split('\n');

  return (
    <div className="flex min-h-full font-mono text-sm bg-gray-950" onMouseUp={handleMouseUp}>
      {/* Gutter */}
      <div className="flex-shrink-0 w-12 bg-gray-900 border-r border-gray-800 text-gray-600 text-right select-none">
         {lines.map((_, i) => {
             const lineNum = i + 1;
             const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
             const hasMarker = lineAnnotations.some(a => a.type === 'marker');
             const hasLabel = lineAnnotations.some(a => a.type === 'label');
             
             // VISUAL INDICATOR FOR SELECTION
             const isSelected = selectionState && selectionState.file === filePath && 
                                lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;

             return (
                 <div 
                    key={i} 
                    className={clsx(
                        "h-6 leading-6 pr-2 relative hover:bg-gray-800 cursor-pointer group transition-all duration-150 z-20",
                        isSelected 
                            ? "bg-blue-900/30 text-blue-200 border-l-4 border-blue-500 font-bold" 
                            : "border-l-4 border-transparent"
                    )}
                    onMouseEnter={() => setHoveredLine(lineNum)}
                    onMouseLeave={() => setHoveredLine(null)}
                    onClick={(e) => handleLineClick(e, lineNum)}
                    onContextMenu={(e) => handleLineContextMenu(e, lineNum)}
                    title="Left-click: Marker | Right-click: Label"
                 >
                     {lineNum}
                     {/* Hover Add Icon */}
                     {hoveredLine === lineNum && !hasMarker && !hasLabel && !isSelected && (
                         <div className="absolute left-1 top-1 text-gray-500 opacity-50 pointer-events-none">
                             <MapPin size={10} />
                         </div>
                     )}
                     {/* Annotation Indicators */}
                     {(hasMarker || hasLabel) && (
                         <div className="absolute left-1 top-1 text-blue-400 pointer-events-none">
                             {hasLabel ? <MessageSquare size={10} className="text-yellow-400" /> : <MapPin size={10} />}
                         </div>
                     )}
                 </div>
             );
         })}
      </div>

      {/* Code */}
      <div className="flex-1 overflow-x-auto">
        <pre className={`language-${getLanguage(filePath)} !bg-transparent !m-0 !p-0 !overflow-visible`}>
          <code ref={codeRef} className={`language-${getLanguage(filePath)} !bg-transparent !p-0 block`}>
            <div className="leading-6">
                {lines.map((line, i) => {
                     const lineNum = i + 1;
                     const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
                     const isSelected = selectionState && selectionState.file === filePath && 
                                lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;

                     return (
                         <div 
                             key={i} 
                             className={clsx("relative h-6 whitespace-pre transition-colors duration-150", isSelected && "bg-blue-500/10")} 
                             data-line-number={lineNum}
                         >
                             {line || '\n'}
                             {/* Annotation Overlays */}
                             {lineAnnotations.map(a => (
                                 <div key={a.id} className="absolute right-4 top-0 z-10 pointer-events-none">
                                     {a.type === 'label' && (
                                         <span className="bg-yellow-900/80 text-yellow-200 text-xs px-2 rounded flex items-center gap-1">
                                             <Tag size={10} /> {a.title}
                                         </span>
                                     )}
                                     {a.type === 'marker' && (
                                          <span className="bg-blue-900/80 text-blue-200 text-xs px-1 rounded opacity-50 hover:opacity-100">
                                              @{a.title}
                                          </span>
                                     )}
                                 </div>
                             ))}
                         </div>
                     );
                })}
            </div>
          </code>
        </pre>
      </div>
    </div>
  );
};