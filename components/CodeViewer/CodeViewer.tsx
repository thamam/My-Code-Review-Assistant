
import React, { useEffect, useRef, useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { SourceView } from './SourceView';
import { FileCode2, Eye } from 'lucide-react';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { MarkdownRenderer } from '../MarkdownRenderer';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode, activeSectionId, walkthrough, focusedLocation, setIsCodeViewerReady } = usePR();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Signal readiness when file changes or mode changes
  useEffect(() => {
    if (selectedFile) {
      const timer = setTimeout(() => setIsCodeViewerReady(true), 250);
      return () => { clearTimeout(timer); setIsCodeViewerReady(false); };
    }
  }, [selectedFile, isDiffMode, isPreviewMode, setIsCodeViewerReady]);

  useEffect(() => {
      if (!selectedFile) return;
      
      let targetLine: number | null = null;
      if (focusedLocation && arePathsEquivalent(focusedLocation.file, selectedFile.path)) {
          targetLine = focusedLocation.line;
      } else if (activeSectionId && walkthrough) {
          const section = walkthrough.sections.find(s => s.id === activeSectionId);
          const highlight = section?.highlights?.find(h => arePathsEquivalent(h.file, selectedFile.path));
          if (highlight) targetLine = highlight.lines[0];
      }

      if (targetLine !== null) {
          const lineNum = targetLine;
          // Use a longer timeout and multiple attempts to ensure DOM is ready
          let attempts = 0;
          const tryScroll = () => {
              const el = document.querySelector(`[data-line-id="${selectedFile.path}:${lineNum}"]`) || 
                         document.querySelector(`[data-line-number="${lineNum}"]`);
              
              if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  const row = el.closest('.flex') || el;
                  row.classList.add('navigation-highlight');
                  setTimeout(() => row.classList.remove('navigation-highlight'), 2000);
              } else if (attempts < 10) {
                  attempts++;
                  setTimeout(tryScroll, 100);
              }
          };
          setTimeout(tryScroll, 100);
      }
  }, [focusedLocation, selectedFile, activeSectionId, walkthrough]);

  if (!selectedFile) return <div className="h-full flex items-center justify-center text-gray-500 bg-gray-950"><FileCode2 size={48} /></div>;

  const isSource = selectedFile.status === 'unchanged' || !isDiffMode || isPreviewMode;
  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden relative">
      <style>{`
        .navigation-highlight { 
          background-color: rgba(59, 130, 246, 0.4) !important; 
          box-shadow: inset 4px 0 0 #3b82f6;
          transition: background-color 2s ease; 
        }
      `}</style>
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <span className="font-mono text-sm text-gray-300 truncate">{selectedFile.path}</span>
        <div className="flex gap-2">
            {selectedFile.path.endsWith('.md') && (
              <button 
                onClick={() => setIsPreviewMode(!isPreviewMode)} 
                className={clsx("p-1 transition-colors", isPreviewMode ? "text-blue-400" : "text-gray-500 hover:text-white")}
              >
                <Eye size={16} />
              </button>
            )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto custom-scrollbar relative">
        {isPreviewMode && selectedFile.path.endsWith('.md') ? (
          <div className="p-8"><MarkdownRenderer content={selectedFile.newContent} /></div>
        ) : isSource ? (
          <SourceView key={selectedFile.path} content={selectedFile.newContent || selectedFile.oldContent || ""} filePath={selectedFile.path} />
        ) : (
          <DiffView 
            key={selectedFile.path} 
            oldContent={selectedFile.oldContent} 
            newContent={selectedFile.newContent} 
            filePath={selectedFile.path} 
            onViewportChange={(f, s, e) => updateViewport({file: f, startLine: s, endLine: e})} 
          />
        )}
      </div>
    </div>
  );
};

import clsx from 'clsx';
