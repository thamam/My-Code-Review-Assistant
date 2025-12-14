import React from 'react';
import { ChatMessage as ChatMessageType } from '../../types';
import clsx from 'clsx';
import { Bot, User } from 'lucide-react';

export const ChatMessage: React.FC<{ message: ChatMessageType }> = ({ message }) => {
  const isUser = message.role === 'user';
  
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
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.context && !isUser && (
           <div className="mt-2 text-xs text-gray-500 border-t border-gray-700 pt-2">
               Reference: {message.context.file}
           </div>
        )}
      </div>
    </div>
  );
};
