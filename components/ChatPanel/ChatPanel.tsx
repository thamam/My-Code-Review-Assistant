
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { ChatMessage } from './ChatMessage';
import { Send, Sparkles, BrainCircuit, Zap, Globe, FileJson, BookOpen, Microscope, Crosshair, GitPullRequest, MessageSquare, Wrench } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { LanguagePreference } from '../../contexts/ChatContext';

export const ChatPanel: React.FC = () => {
  const { messages, sendMessage, isTyping, currentModel, setModel, language, setLanguage, engine, setEngine, exportSessionLogs } = useChat();
  const { viewportState, appMode } = usePR();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const suggestion = viewportState.file
    ? `Analyze architectural implications of lines ${viewportState.startLine}-${viewportState.endLine}`
    : "Provide a staff-level summary of these changes";

  const isPro = currentModel.includes('pro');

  const getModeBadge = () => {
    let icon = GitPullRequest;
    let label = "PR";
    let color = "bg-blue-900/40 text-blue-300 border-blue-700";

    switch (appMode) {
      case 'learn':
        icon = BookOpen; label = "LEARN"; color = "bg-green-900/40 text-green-300 border-green-700"; break;
      case 'dive':
        icon = Microscope; label = "DIVE"; color = "bg-purple-900/40 text-purple-300 border-purple-700"; break;
      case 'custom':
        icon = Crosshair; label = "CUSTOM"; color = "bg-orange-900/40 text-orange-300 border-orange-700"; break;
    }

    const Icon = icon;
    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${color}`}>
        <Icon size={10} />
        {label}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800 w-full">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {isPro ? <BrainCircuit size={16} className="text-pink-400" /> : <Zap size={16} className="text-yellow-400" />}
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Theia AI</h2>
          {getModeBadge()}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setEngine('simple')}
              data-testid="engine-toggle-simple"
              title="Chat mode: fast streaming answers with web sources. Cannot navigate or run commands."
              className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${engine === 'simple' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <MessageSquare size={10} /> Chat
            </button>
            <button
              type="button"
              onClick={() => setEngine('agent')}
              data-testid="engine-toggle-agent"
              title="Agent mode: can navigate the viewer, run terminal commands, and edit files (with approval). Slower."
              className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${engine === 'agent' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Wrench size={10} /> Agent
            </button>
          </div>
          <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-1">
            <Globe size={10} className="text-gray-500" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
              className="bg-transparent text-[10px] text-gray-300 outline-none cursor-pointer"
            >
              <option value="Auto">Auto</option>
              <option value="English">English</option>
              <option value="Hebrew">עברית</option>
            </select>
          </div>
          <select
            value={currentModel}
            onChange={(e) => setModel(e.target.value)}
            className="bg-gray-800 text-[10px] text-gray-300 border border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer hover:bg-gray-750"
          >
            <option value="gemini-3.1-pro-preview">Pro 3.1 (Expert Reasoning)</option>
            <option value="gemini-3-flash-preview">Flash 3 (Fast Response)</option>
            <option value="gemini-2.5-flash-lite">Flash Lite 2.5 (Fastest)</option>
          </select>
          <button
            onClick={exportSessionLogs}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Export Session JSON"
          >
            <FileJson size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={scrollRef}>
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div className="flex gap-2 ml-10">
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-800 shrink-0">
        <button
          onClick={() => setInput(suggestion)}
          className="text-xs text-purple-400 hover:text-purple-300 mb-2 truncate max-w-full text-left"
        >
          Suggested: {suggestion}
        </button>

        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for a professional review..."
            data-testid="chat-input"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            data-testid="send-button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
