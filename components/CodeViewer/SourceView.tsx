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
  const { annotations, addAnnotation, removeAnnotation } = usePR();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [content, filePath]);

  const fileAnnotations = annotations.filter(a => a.file === filePath);
  
  const getLanguage = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript'; // Prism uses javascript for ts often in basics
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.json')) return 'json';
    return 'clike';
  };

  const handleLineClick = (lineNum: number) => {
     addAnnotation(filePath, lineNum, 'marker');
  };

  const lines = content.split('\n');

  return (
    <div className="flex min-h-full font-mono text-sm bg-gray-950">
      {/* Gutter */}
      <div className="flex-shrink-0 w-12 bg-gray-900 border-r border-gray-800 text-gray-600 text-right select-none">
         {lines.map((_, i) => {
             const lineNum = i + 1;
             const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
             const hasMarker = lineAnnotations.some(a => a.type === 'marker');
             const hasLabel = lineAnnotations.some(a => a.type === 'label');

             return (
                 <div 
                    key={i} 
                    className="h-6 leading-6 pr-2 relative hover:bg-gray-800 cursor-pointer group"
                    onMouseEnter={() => setHoveredLine(lineNum)}
                    onMouseLeave={() => setHoveredLine(null)}
                    onClick={() => handleLineClick(lineNum)}
                 >
                     {lineNum}
                     {/* Hover Add Icon */}
                     {hoveredLine === lineNum && !hasMarker && !hasLabel && (
                         <div className="absolute left-1 top-1 text-gray-500 opacity-50">
                             <MapPin size={10} />
                         </div>
                     )}
                     {/* Annotation Indicators */}
                     {(hasMarker || hasLabel) && (
                         <div className="absolute left-1 top-1 text-blue-400">
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
            {/* We render lines manually to align with gutter for annotations if needed, but Prism expects raw text. 
                For simple aligned rendering, we can rely on standard line-height. 
                Prism typically highlights the whole block. 
                To support line decorations, we might need a different approach or overlay. 
                Here we rely on line-height 1.5rem (h-6 = 24px) consistency. */}
            <div className="leading-6">
                {lines.map((line, i) => {
                     const lineNum = i + 1;
                     const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
                     return (
                         <div key={i} className="relative h-6 whitespace-pre">
                             {line || '\n'}
                             {/* Annotation Overlays */}
                             {lineAnnotations.map(a => (
                                 <div key={a.id} className="absolute right-4 top-0 z-10">
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