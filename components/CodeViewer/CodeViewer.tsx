import React, { useEffect, useRef } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { SourceView } from './SourceView';
import { FileCode2 } from 'lucide-react';
import { arePathsEquivalent } from '../../utils/fileUtils';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode, activeSectionId, walkthrough } = usePR();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleViewportChange = (file: string, start: number, end: number) => {
    updateViewport({ file, startLine: start, endLine: end });
  };

  useEffect(() => {
    if (!selectedFile || !activeSectionId || !walkthrough) return;

    const section = walkthrough.sections.find(s => s.id === activeSectionId);
    if (!section) return;

    // Check if the current file is part of the section
    const isFileInSection = section.files.some(f => arePathsEquivalent(f, selectedFile.path));
    if (!isFileInSection) return;

    const highlight = section.highlights?.find(h => arePathsEquivalent(h.file, selectedFile.path));
    
    if (highlight) {
        const lineToScroll = highlight.lines[0];
        const timer = setTimeout(() => {
            const marker = document.querySelector(`[data-line-id="${selectedFile.path}:${lineToScroll}"]`);
            if (marker) {
                marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);
        return () => clearTimeout(timer);
    } else {
        // If no specific highlight but we are in the section's file, scroll to top to ensure context
        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
  }, [selectedFile, activeSectionId, walkthrough]);

  if (!selectedFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-950">
        <FileCode2 size={48} className="mb-4 opacity-50" />
        <p>Select a file to view changes</p>
      </div>
    );
  }

  // Use SourceView if the file is unchanged OR if the user explicitly toggled "Show Raw" (isDiffMode === false)
  const useSourceView = selectedFile.status === 'unchanged' || !isDiffMode;

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
           <span className="font-mono text-sm text-gray-300">{selectedFile.path}</span>
           <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
             {selectedFile.status}
           </span>
        </div>
        {!useSourceView && (
             <div className="flex items-center gap-4 text-[10px] text-gray-500">
                 <div className="flex items-center gap-1">
                     <div className="w-2 h-2 bg-green-900/50 border border-green-700 rounded-sm"></div>
                     <span>Added</span>
                 </div>
                 <div className="flex items-center gap-1">
                     <div className="w-2 h-2 bg-red-900/50 border border-red-700 rounded-sm"></div>
                     <span>Deleted</span>
                 </div>
             </div>
        )}
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto custom-scrollbar relative scroll-smooth"
      >
        {useSourceView ? (
            <SourceView 
                key={selectedFile.path}
                content={selectedFile.newContent || selectedFile.oldContent || ""}
                filePath={selectedFile.path}
            />
        ) : (
            <DiffView 
                key={selectedFile.path}
                oldContent={selectedFile.oldContent} 
                newContent={selectedFile.newContent}
                filePath={selectedFile.path}
                onViewportChange={handleViewportChange}
            />
        )}
      </div>
    </div>
  );
};