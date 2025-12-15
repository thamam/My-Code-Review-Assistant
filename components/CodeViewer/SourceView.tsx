import React, { useState, useCallback } from 'react';
import Prism from 'prismjs';
import { usePR } from '../../contexts/PRContext';
import { Annotation } from '../../types';
import { MessageSquare, MapPin, Tag } from 'lucide-react';
import clsx from 'clsx';

// --- Syntax Highlighting Helpers ---

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
    // Optimization for very long lines
    if (text.length > 1000) return <>{text}</>;

    try {
        const grammar = Prism.languages[language] || Prism.languages.clike;
        // Fallback for languages not loaded
        if (!grammar) return <>{text}</>;
        
        const tokens = Prism.tokenize(text, grammar);
        return (
            <>
                {tokens.map((token, i) => renderToken(token, i))}
            </>
        );
    } catch (e) {
        console.warn("Tokenization failed", e);
        return <>{text}</>;
    }
});

interface SourceViewProps {
  content: string;
  filePath: string;
}

export const SourceView: React.FC<SourceViewProps> = ({ content, filePath }) => {
  const { annotations, addAnnotation, removeAnnotation, selectionState, setSelectionState } = usePR();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const fileAnnotations = annotations.filter(a => a.file === filePath);
  
  const getLanguage = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript'; // Prism often uses 'javascript' for TS basics in lightweight setups
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    return 'clike';
  };

  const language = getLanguage(filePath);

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

  const handleMouseUp = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      // Traverse up to find the line container
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

      const startLine = findLineNumber(range.startContainer);
      const endLine = findLineNumber(range.endContainer);

      if (startLine !== null && endLine !== null) {
          const actualStart = Math.min(startLine, endLine);
          const actualEnd = Math.max(startLine, endLine);
          const lines = content.split('\n');
          // Adjust for 0-based index vs 1-based lines
          const selectedText = lines.slice(actualStart - 1, actualEnd).join('\n');
          
          if (selectedText) {
            setSelectionState({
                file: filePath,
                startLine: actualStart,
                endLine: actualEnd,
                content: selectedText
            });
          }
      }
  }, [content, filePath, setSelectionState]);

  const lines = content.split('\n');

  return (
    <div className="flex min-h-full font-mono text-sm bg-gray-950" onMouseUp={handleMouseUp}>
      {/* Gutter */}
      <div className="flex-shrink-0 w-12 bg-gray-900 border-r border-gray-800 text-gray-600 text-right select-none pt-2">
         {lines.map((_, i) => {
             const lineNum = i + 1;
             const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
             const hasMarker = lineAnnotations.some(a => a.type === 'marker');
             const hasLabel = lineAnnotations.some(a => a.type === 'label');
             
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

      {/* Code Area */}
      <div className="flex-1 overflow-x-auto pt-2">
        {/* We use a specific class to ensure Prism styles apply to our spans, without Prism taking over the DOM */}
        <div className={`language-${language} !bg-transparent`}>
            {lines.map((line, i) => {
                 const lineNum = i + 1;
                 const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
                 const isSelected = selectionState && selectionState.file === filePath && 
                            lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;

                 return (
                     <div 
                         key={i} 
                         className={clsx(
                             "relative h-6 leading-6 whitespace-pre px-4 transition-colors duration-150 flex items-center", 
                             isSelected && "bg-blue-500/10"
                         )} 
                         data-line-number={lineNum}
                     >
                         <span className="inline-block min-w-full">
                            <HighlightedText text={line || ' '} language={language} />
                         </span>
                         
                         {/* Annotation Overlays */}
                         {lineAnnotations.length > 0 && (
                             <div className="absolute right-4 top-0 h-full flex items-center gap-2 pointer-events-none opacity-80">
                                 {lineAnnotations.map(a => (
                                     <span key={a.id} className={clsx(
                                         "text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm",
                                         a.type === 'label' ? "bg-yellow-900 text-yellow-200" : "bg-blue-900 text-blue-200"
                                     )}>
                                         {a.type === 'label' ? <Tag size={10} /> : <MapPin size={10} />}
                                         {a.title}
                                     </span>
                                 ))}
                             </div>
                         )}
                     </div>
                 );
            })}
        </div>
      </div>
    </div>
  );
};