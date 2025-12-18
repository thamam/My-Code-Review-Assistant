
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { ChatMessage } from './ChatMessage';
import { Send, Sparkles, BrainCircuit, Zap, Globe } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { LanguagePreference } from '../../contexts/ChatContext';

export const ChatPanel: React.FC = () => {
  const { messages, sendMessage, isTyping, currentModel, setModel, language, setLanguage } = useChat();
  const { viewportState } = usePR();
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

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-800 w-full">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2">
            {isPro ? <BrainCircuit size={16} className="text-pink-400" /> : <Zap size={16} className="text-yellow-400" />}
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Theia AI</h2>
         </div>
         
         <div className="flex items-center gap-2">
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
                <option value="gemini-3-pro-preview">Pro 3 (Expert Reasoning)</option>
                <option value="gemini-3-flash-preview">Flash 3 (Fast Response)</option>
             </select>
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
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 placeholder-gray-500"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
