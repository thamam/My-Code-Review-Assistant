/**
 * src/contexts/ChatContext.tsx
 * The Dumb Terminal: Renders state and emits events.
 * No LLM logic allowed.
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { usePR } from './PRContext';
// NEW IMPORTS
import { eventBus } from '../src/modules/core/EventBus';
import { agent } from '../src/modules/core/Agent'; // Force instantiation

export type LanguagePreference = 'English' | 'Hebrew' | 'Auto';

export interface UserContextState {
  activeTab: 'files' | 'annotations' | 'issue' | 'diagrams';
  activeFile: string | null;
  activeSelection: string | null;
  activeDiagram: string | null;
}

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  addLocalMessage: (message: ChatMessage) => void;
  upsertMessage: (message: ChatMessage) => void;
  resetChat: () => void;
  isTyping: boolean;
  currentModel: string;
  setModel: (model: string) => void;
  language: LanguagePreference;
  setLanguage: (lang: LanguagePreference) => void;
  updateUserContext: (state: Partial<UserContextState>) => void;
  exportSessionLogs: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData } = usePR(); // We still need PR data to pass to the agent
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-2.0-flash-exp');
  const [language, setLanguage] = useState<LanguagePreference>('Auto');

  // Keep context ref for "Snapshot" capability
  const userContextRef = useRef<UserContextState>({
    activeTab: 'files',
    activeFile: null,
    activeSelection: null,
    activeDiagram: null
  });

  // --- NERVOUS SYSTEM CONNECTION ---
  useEffect(() => {
    // Subscribe to Agent Actions
    const unsubscribe = eventBus.subscribe((event) => {

      // 1. Agent Speaks (Output)
      if (event.type === 'AGENT_SPEAK') {
        const msg: ChatMessage = {
          id: `ai-${event.timestamp}`,
          role: 'assistant',
          content: event.payload.text,
          timestamp: event.timestamp
        };
        addLocalMessage(msg);
      }

      // 2. Agent Thinking (Status)
      if (event.type === 'AGENT_THINKING') {
        setIsTyping(event.payload.status !== 'idle');
      }
    });

    return unsubscribe;
  }, []);

  // --- ACTIONS ---

  const sendMessage = async (text: string) => {
    // 1. Update Local UI immediately (Optimistic)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    addLocalMessage(userMsg);

    // 2. Emit Signal to Brain
    console.log('[ChatContext] Emitting USER_MESSAGE to EventBus');
    eventBus.emit({
      type: 'USER_MESSAGE',
      payload: {
        text,
        mode: 'text',
        context: userContextRef.current, // Pass the view snapshot
        prData: prData // Pass the data snapshot
      }
    });
  };

  const addLocalMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const upsertMessage = (message: ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === message.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = message;
        return copy;
      }
      return [...prev, message];
    });
  };

  const updateUserContext = (updates: Partial<UserContextState>) => {
    userContextRef.current = { ...userContextRef.current, ...updates };
  };

  // Boilerplate...
  const resetChat = () => setMessages([]);
  const exportSessionLogs = () => {}; // Todo

  return (
    <ChatContext.Provider value={{ messages, sendMessage, addLocalMessage, upsertMessage, isTyping, resetChat, currentModel, setModel, language, setLanguage, updateUserContext, exportSessionLogs }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
