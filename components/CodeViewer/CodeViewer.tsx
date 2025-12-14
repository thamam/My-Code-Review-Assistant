import React from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { FileCode2 } from 'lucide-react';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode } = usePR();

  const handleViewportChange = (file: string, start: number, end: number) => {
    updateViewport({ file, startLine: start, endLine: end });
  };

  if (!selectedFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-950">
        <FileCode2 size={48} className="mb-4 opacity-50" />
        <p>Select a file to view changes</p>
      </div>
    );
  }

  // If isDiffMode is false, we technically want to see just the new file content without diff colors.
  // For this PoC, we will reuse DiffView but we could conditionally pass oldContent=undefined to simulate "Just the file".
  // However, normally a code viewer needs standard syntax highlighting. 
  // We'll stick to the diff view but maybe suppress colors if !isDiffMode?
  // For simplicity in this PoC, we render DiffView always but toggle display styles or props.
  
  // Actually, let's just use the DiffView. The prompt requested separate logic for "unchanged" vs "changed".
  // DiffView handles both via computeDiff.

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
      
      <div className="flex-1 overflow-auto custom-scrollbar relative">
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
