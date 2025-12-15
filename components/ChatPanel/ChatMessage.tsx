import React, { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../../types';
import clsx from 'clsx';
import { Bot, User, Copy, Check } from 'lucide-react';

const CodeBlock = ({ content }: { content: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-2 rounded-md overflow-hidden bg-gray-950 border border-gray-800">
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={handleCopy}
                    className="p-1.5 bg-gray-800 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                    title="Copy code"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
            </div>
            <pre className="p-3 text-xs overflow-x-auto text-gray-300 font-mono">
                <code>{content}</code>
            </pre>
        </div>
    );
};

export const ChatMessage: React.FC<{ message: ChatMessageType }> = ({ message }) => {
  const isUser = message.role === 'user';
  
  // Simple parser to detect code blocks
  const renderContent = (text: string) => {
      const parts = text.split(/```([\s\S]*?)```/g);
      return parts.map((part, i) => {
          if (i % 2 === 1) {
              // Code block
              return <CodeBlock key={i} content={part.trim()} />;
          }
          // Regular text (handle newlines)
          return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      });
  };
  
  return (
    <div className={clsx("flex gap-3 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={clsx(
        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
        isUser ? "bg-blue-600" : "bg-purple-600"
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      
      <div className={clsx(
        "max-w-[85%] rounded-lg p-3 text-sm leading-relaxed",
        isUser ? "bg-blue-600/10 text-blue-100" : "bg-gray-800 text-gray-200"
      )}>
        <div>{renderContent(message.content)}</div>
        {message.context && !isUser && (
           <div className="mt-2 text-xs text-gray-500 border-t border-gray-700 pt-2">
               Reference: {message.context.file}
           </div>
        )}
      </div>
    </div>
  );
};