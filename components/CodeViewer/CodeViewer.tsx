
import React, { useRef, useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiffView } from './DiffView';
import { SourceView } from './SourceView';
import { FileCode2, Eye, Lock } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import clsx from 'clsx';

export const CodeViewer: React.FC = () => {
  const { selectedFile, updateViewport, isDiffMode, lazyFiles } = usePR();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Check if current file is a lazy-loaded (read-only) file
  const isReadOnly = selectedFile && lazyFiles.has(selectedFile.path);

  if (!selectedFile) return <div className="h-full flex items-center justify-center text-gray-500 bg-gray-950"><FileCode2 size={48} /></div>;

  const isSource = selectedFile.status === 'unchanged' || !isDiffMode || isPreviewMode;
  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden relative" data-testid="code-viewer-container">
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-gray-300 truncate">{selectedFile.path}</span>
          {/* Phase 9: READ ONLY badge for lazy-loaded files */}
          {isReadOnly && (
            <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-gray-700 rounded text-[10px] text-gray-400 uppercase">
              <Lock size={10} />
              Read Only
            </span>
          )}
        </div>
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
          <div className="p-8"><MarkdownRenderer content={(selectedFile as any).newContent || (selectedFile as any).content || ''} /></div>
        ) : isSource ? (
          <SourceView
            key={selectedFile.path}
            content={(selectedFile as any).newContent || (selectedFile as any).content || (selectedFile as any).oldContent || ""}
            filePath={selectedFile.path}
            onViewportChange={(f, s, e) => updateViewport({ file: f, startLine: s, endLine: e })}
          />
        ) : (
          <DiffView
            key={selectedFile.path}
            oldContent={(selectedFile as any).oldContent || ""}
            newContent={(selectedFile as any).newContent || (selectedFile as any).content || ""}
            filePath={selectedFile.path}
            onViewportChange={(f, s, e) => updateViewport({ file: f, startLine: s, endLine: e })}
          />
        )}
      </div>
    </div>
  );
};
