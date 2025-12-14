import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isTyping: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { selectedFile, viewportState, walkthrough } = usePR();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize System Prompt based on Walkthrough availability
  useEffect(() => {
    if (!hasInitialized) {
        let initialContent = 'Welcome to the Code Review Assistant. Ask me anything about this PR!';
        if (walkthrough) {
            initialContent += `\n\nI have loaded the walkthrough **"${walkthrough.title}"**. I can guide you through the ${walkthrough.sections.length} key sections of change.`;
        }
        
        setMessages([
            {
                id: 'welcome',
                role: 'system',
                content: initialContent,
                timestamp: Date.now()
            }
        ]);
        setHasInitialized(true);
    }
  }, [walkthrough, hasInitialized]);

  const sendMessage = async (text: string) => {
    const newUserMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      context: {
        file: selectedFile?.path || '',
        lineRange: [viewportState.startLine, viewportState.endLine]
      }
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsTyping(true);

    // Simulate AI delay and processing
    setTimeout(() => {
      let responseText = `I see you're looking at **${selectedFile?.path}**`;
      if (viewportState.startLine > 0) {
        responseText += ` (lines ${viewportState.startLine}-${viewportState.endLine}).\n\n`;
      } else {
        responseText += '.\n\n';
      }

      if (walkthrough) {
          const relatedSection = walkthrough.sections.find(s => s.files.includes(selectedFile?.path || ''));
          if (relatedSection) {
              responseText += `This file is part of the walkthrough section: **${relatedSection.title}**.\n> ${relatedSection.description}\n\n`;
          }
      }

      if (text.toLowerCase().includes('explain')) {
        responseText += "This code appears to implement core logic. The changes suggest a refactor to improve modularity.";
      } else if (text.toLowerCase().includes('bug')) {
        responseText += "I don't see any obvious bugs, but ensure that input validation is handled correctly.";
      } else if (text.toLowerCase().includes('walkthrough')) {
         if (walkthrough) {
             responseText += "The walkthrough covers:\n" + walkthrough.sections.map(s => `- ${s.title}`).join('\n');
         } else {
             responseText += "No walkthrough is currently loaded.";
         }
      } else {
        responseText += "That's an interesting observation. The changes here align with the PR description.";
      }

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <ChatContext.Provider value={{ messages, sendMessage, isTyping }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};