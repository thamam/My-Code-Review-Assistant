import React, { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../../types';
import clsx from 'clsx';
import { Bot, User, Copy, Check, Volume2 } from 'lucide-react';
import { MermaidRenderer } from '../Diagrams/MermaidRenderer';

const CodeBlock: React.FC<{ content: string }> = ({ content }) => {
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

  // Dual-Track JSON parsing: extract screen content and detect voice presence
  let displayContent = message.content;
  let hasVoice = false;

  if (!isUser) {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.voice && parsed.screen) {
        displayContent = parsed.screen;
        hasVoice = true;
      }
    } catch (e) {
      // Not JSON, treat as legacy plain text
    }
  }

  console.log('[ChatMessage] displayContent:', displayContent);

  // Simple parser to detect code blocks
  const renderContent = (text: string) => {
    console.log('[ChatMessage] Parsing content length:', text.length);
    // Split by triple backticks, capturing the optional language tag
    // More flexible regex: allows optional whitespace after backticks
    const parts = text.split(/```(\w+)?\s*\n?([\s\S]*?)```/g);

    if (parts.length === 1) return <span className="whitespace-pre-wrap">{text}</span>;

    console.log('[ChatMessage] Split into parts:', parts.length);
    const results = [];
    let i = 0;

    while (i < parts.length) {
      if (parts[i]) {
        results.push(<span key={`text-${i}`} className="whitespace-pre-wrap">{parts[i]}</span>);
      }

      if (i + 2 < parts.length) {
        const lang = (parts[i + 1] || 'text').trim().toLowerCase();
        const content = parts[i + 2];
        console.log(`[ChatMessage] Detected code block: lang=${lang}, content length=${content.length}`);

        if (lang === 'mermaid') {
          results.push(
            <div key={`mermaid-${i}`} className="my-4 h-64 border border-gray-700 rounded-lg overflow-hidden bg-gray-950">
              <MermaidRenderer code={content} id={`chat-diagram-${i}`} />
            </div>
          );
        } else {
          results.push(<CodeBlock key={`code-${i}`} content={content} />);
        }
        i += 3;
      } else {
        i++;
      }
    }
    return results;
  };

  return (
    <div className={clsx("flex gap-3 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className="relative">
        <div className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "bg-blue-600" : "bg-purple-600"
        )}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>
        {hasVoice && (
          <div
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"
            title="This message was spoken"
          >
            <Volume2 size={10} className="text-white" />
          </div>
        )}
      </div>

      <div className={clsx(
        "max-w-[85%] rounded-lg p-3 text-sm leading-relaxed",
        isUser ? "bg-blue-600/10 text-blue-100" : "bg-gray-800 text-gray-200"
      )}>
        <div>{renderContent(displayContent)}</div>
        {message.context && !isUser && (
          <div className="mt-2 text-xs text-gray-500 border-t border-gray-700 pt-2">
            Reference: {message.context.file}
          </div>
        )}
      </div>
    </div>
  );
};