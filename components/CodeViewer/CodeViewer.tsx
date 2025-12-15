import React, { useEffect, useRef, useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { SourceView } from './SourceView';
import { FileCode2, Eye, Code2 } from 'lucide-react';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { MarkdownRenderer } from '../MarkdownRenderer';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode, activeSectionId, walkthrough, focusedLocation } = usePR();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Reset preview mode when file changes
  useEffect(() => {
    setIsPreviewMode(false);
  }, [selectedFile?.path]);

  const handleViewportChange = (file: string, start: number, end: number) => {
    updateViewport({ file, startLine: start, endLine: end });
  };

  // Scroll logic for Walkthroughs
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
        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
  }, [selectedFile, activeSectionId, walkthrough]);

  // Scroll logic for explicit Jump To / Focus
  useEffect(() => {
      if (focusedLocation && selectedFile && focusedLocation.file === selectedFile.path) {
          const timer = setTimeout(() => {
              // Try finding DiffView marker first
              const marker = document.querySelector(`[data-line-id="${selectedFile.path}:${focusedLocation.line}"]`);
              if (marker) {
                  marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  marker.parentElement?.classList.add('bg-blue-500/20', 'transition-colors', 'duration-500');
                  setTimeout(() => marker.parentElement?.classList.remove('bg-blue-500/20'), 1000);
              } else {
                  // Fallback for SourceView using line number attribute
                  const row = document.querySelector(`[data-line-number="${focusedLocation.line}"]`);
                  if (row) {
                      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      row.classList.add('bg-blue-500/20', 'transition-colors', 'duration-500');
                      setTimeout(() => row.classList.remove('bg-blue-500/20'), 1000);
                  }
              }
          }, 100);
          return () => clearTimeout(timer);
      }
  }, [focusedLocation, selectedFile]);

  if (!selectedFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-950">
        <FileCode2 size={48} className="mb-4 opacity-50" />
        <p>Select a file to view changes</p>
      </div>
    );
  }

  // Use SourceView if the file is unchanged OR if the user explicitly toggled "Show Raw" (isDiffMode === false)
  // OR if we are in Preview Mode
  const isSourceOrPreview = selectedFile.status === 'unchanged' || !isDiffMode || isPreviewMode;
  const isMarkdown = selectedFile.path.toLowerCase().endsWith('.md');

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
           <span className="font-mono text-sm text-gray-300">{selectedFile.path}</span>
           <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
             {selectedFile.status}
           </span>
        </div>
        
        <div className="flex items-center gap-4">
            {isMarkdown && (
                <button
                    onClick={() => setIsPreviewMode(!isPreviewMode)}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
                        isPreviewMode 
                            ? "bg-purple-900/50 text-purple-300 border border-purple-700" 
                            : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
                    }`}
                    title={isPreviewMode ? "Show Code" : "Preview Markdown"}
                >
                    {isPreviewMode ? <Code2 size={14} /> : <Eye size={14} />}
                    <span className="hidden sm:inline">{isPreviewMode ? "Source" : "Preview"}</span>
                </button>
            )}

            {!isSourceOrPreview && (
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
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto custom-scrollbar relative scroll-smooth"
      >
        {isPreviewMode && isMarkdown ? (
            <div className="p-8 max-w-4xl mx-auto">
                <MarkdownRenderer content={selectedFile.newContent || selectedFile.oldContent || ''} />
            </div>
        ) : isSourceOrPreview ? (
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