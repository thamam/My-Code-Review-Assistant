import React, { useState } from 'react';
import { usePR } from '../contexts/PRContext';
import { useChat } from '../contexts/ChatContext';
import { useLive } from '../contexts/LiveContext';
import { Link, AlertCircle, ExternalLink, RefreshCw, Check, Target, HelpCircle } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import clsx from 'clsx';

interface LinearPanelProps {
  onLinkClick: () => void;
}

export const LinearPanel: React.FC<LinearPanelProps> = ({ onLinkClick }) => {
  const { linearIssue } = usePR();
  const { sendMessage: sendChatMessage } = useChat();
  const { sendText: sendLiveMessage, isActive: isLiveActive } = useLive();
  const [isSyncing, setIsSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const handleSync = async () => {
    if (!linearIssue) return;
    setIsSyncing(true);

    const syncText = `[CONTEXT UPDATE] Here are the requirements from Linear Issue ${linearIssue.identifier} (${linearIssue.title}):\n\n${linearIssue.description}\n\nPlease acknowledge you have these requirements and refer to them for the review.`;

    try {
      // Push to chat
      await sendChatMessage(syncText);

      // Push to live session if active
      if (isLiveActive) {
        sendLiveMessage(syncText);
      }

      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // PHASE 4: Find It Flow - Trigger Theia to find code for this issue
  const handleFindCode = async () => {
    if (!linearIssue) return;

    const prompt = `I am working on Linear Issue ${linearIssue.identifier}: '${linearIssue.title}'. Find the code responsible for this feature and navigate me there.`;

    try {
      await sendChatMessage(prompt);
    } catch (e) {
      console.error("Find code failed", e);
    }
  };

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
          <div className="flex items-center gap-1">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={clsx(
                "p-1.5 rounded transition-all",
                synced ? "text-green-400 bg-green-900/20" : "text-gray-500 hover:text-white hover:bg-gray-800"
              )}
              title="Force sync issue context with AI Agent"
            >
              {synced ? <Check size={14} /> : <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
            </button>
            <button
              onClick={handleFindCode}
              className="p-1.5 text-gray-500 hover:text-purple-400 hover:bg-gray-800 rounded transition-all"
              title="Find code for this issue"
              data-testid="find-code-button"
            >
              <Target size={14} />
            </button>
            <a
              href={linearIssue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors shrink-0"
              title="Open in Linear"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-mono text-gray-500">{linearIssue.identifier}</span>
          {linearIssue.state && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(linearIssue.state)}`}>
              {linearIssue.state}
            </span>
          )}

          {/* Help Tooltip */}
          <div className="relative ml-auto group">
            <button
              className="p-1 text-gray-600 hover:text-gray-400 transition-colors"
              aria-label="Help"
              data-testid="linear-help-button"
            >
              <HelpCircle size={14} />
            </button>
            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <h4 className="text-xs font-bold text-gray-200 mb-2 uppercase tracking-wide">Quick Guide</h4>
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400">🟣</span>
                  <span><strong className="text-gray-200">Target Icon:</strong> Find the code that implements this issue.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span>🔄</span>
                  <span><strong className="text-gray-200">Sync Icon:</strong> Refresh issue details from Linear.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span>✨</span>
                  <span><strong className="text-gray-200">Selection:</strong> Highlight code to check it against Acceptance Criteria.</span>
                </div>
              </div>
            </div>
          </div>
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