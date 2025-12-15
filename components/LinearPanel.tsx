import React from 'react';
import { usePR } from '../contexts/PRContext';
import { Link, AlertCircle, ExternalLink } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface LinearPanelProps {
  onLinkClick: () => void;
}

export const LinearPanel: React.FC<LinearPanelProps> = ({ onLinkClick }) => {
  const { linearIssue } = usePR();

  if (!linearIssue) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 bg-gray-900 border-l border-gray-800">
        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <Link size={24} className="opacity-50" />
        </div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">No Issue Linked</h3>
        <p className="text-xs mb-6 max-w-[200px]">Link a Linear issue to see acceptance criteria and context alongside the code.</p>
        <button 
          onClick={onLinkClick}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wide rounded transition-colors"
        >
          Link Issue
        </button>
      </div>
    );
  }

  const getStatusColor = (status?: string) => {
      const s = status?.toLowerCase() || '';
      if (s.includes('done') || s.includes('complete')) return 'bg-green-900/50 text-green-300 border-green-800';
      if (s.includes('progress')) return 'bg-blue-900/50 text-blue-300 border-blue-800';
      if (s.includes('cancel')) return 'bg-gray-800 text-gray-400 border-gray-700';
      return 'bg-yellow-900/50 text-yellow-300 border-yellow-800';
  };

  return (
    <div className="h-full bg-gray-900 border-l border-gray-800 flex flex-col font-sans">
      <div className="p-4 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="text-sm font-bold text-gray-100 leading-snug">
                {linearIssue.title}
            </h2>
            <a 
                href={linearIssue.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-blue-400 transition-colors shrink-0"
                title="Open in Linear"
            >
                <ExternalLink size={14} />
            </a>
        </div>
        
        <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-mono text-gray-500">{linearIssue.identifier}</span>
            {linearIssue.state && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(linearIssue.state)}`}>
                    {linearIssue.state}
                </span>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
         {linearIssue.description ? (
             <MarkdownRenderer content={linearIssue.description} />
         ) : (
             <span className="text-gray-500 italic text-sm">No description provided.</span>
         )}
      </div>
    </div>
  );
};