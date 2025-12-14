import React, { useEffect, useRef } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { FileCode2 } from 'lucide-react';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode, activeSectionId, walkthrough } = usePR();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleViewportChange = (file: string, start: number, end: number) => {
    updateViewport({ file, startLine: start, endLine: end });
  };

  // Auto-scroll to walkthrough highlights
  useEffect(() => {
    if (!selectedFile || !activeSectionId || !walkthrough) return;

    const section = walkthrough.sections.find(s => s.id === activeSectionId);
    if (!section) return;

    // Find the highlight for the current file in this section
    const highlight = section.highlights?.find(h => h.file === selectedFile.path);
    
    if (highlight) {
        const lineToScroll = highlight.lines[0];
        // Short timeout to allow DiffView to render if file just changed
        const timer = setTimeout(() => {
            // Find the LineMarker element by its data attribute
            const marker = document.querySelector(`[data-line-id="${selectedFile.path}:${lineToScroll}"]`);
            if (marker) {
                marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 150);
        return () => clearTimeout(timer);
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

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
           <span className="font-mono text-sm text-gray-300">{selectedFile.path}</span>
           <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
             {selectedFile.status}
           </span>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto custom-scrollbar relative scroll-smooth"
      >
        <DiffView 
          key={selectedFile.path} // Force re-render on file switch
          oldContent={isDiffMode ? selectedFile.oldContent : undefined} 
          newContent={selectedFile.newContent}
          filePath={selectedFile.path}
          onViewportChange={handleViewportChange}
        />
      </div>
    </div>
  );
};