/**
 * contexts/ChatContext.tsx
 * The Dumb Terminal: Renders state and emits events.
 * Phase 10.3: The Hands - Executes Agent commands via EventBus.
 * No LLM logic allowed.
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '../types';
import { usePR } from './PRContext';
// Event-Driven Architecture imports
import { eventBus } from '../src/modules/core/EventBus';
import { agent } from '../src/modules/core/Agent'; // Force instantiation (Polyfill enabled)
import { runtime } from '../src/modules/runtime'; // Force runtime instantiation (Phase 11)

// Force side-effect execution (prevent tree-shaking)
void agent;
void runtime;

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
  // Inject dependencies from PRContext (The Hands)
  const {
    prData,
    navigateToCode,
    setLeftTab,
    setIsDiffMode
  } = usePR();

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
    console.log('[ChatContext] Subscribing to Agent events (The Hands)...');

    // Expose EventBus for test injection (The Smoke Test Hook)
    if (typeof window !== 'undefined') {
      (window as any).__THEIA_EVENT_BUS__ = eventBus;
    }

    // Subscribe to all Agent Actions via wildcard
    const unsubscribe = eventBus.subscribe('*', (envelope) => {
      const event = envelope.event; // Extract event from envelope

      // 1. Agent Speaks (Output)
      if (event.type === 'AGENT_SPEAK') {
        const msg: ChatMessage = {
          id: `ai-${envelope.timestamp}`,
          role: 'assistant',
          content: event.payload.text || event.payload.content || '',
          timestamp: envelope.timestamp
        };
        setMessages(prev => [...prev, msg]);
      }

      // 2. Agent Thinking (Status)
      if (event.type === 'AGENT_THINKING') {
        setIsTyping(event.payload.stage !== 'completed');
      }

      // 3. Agent Navigate (The Hands - Navigation)
      if (event.type === 'AGENT_NAVIGATE') {
        const { target, reason } = event.payload;
        console.log(`[ChatContext] AGENT_NAVIGATE received: ${target.file}:${target.line} - ${reason}`);
        navigateToCode({
          filepath: target.file,
          line: target.line,
          source: 'search'
        });
      }

      // 4. Agent Tab Switch (The Hands - Tab Control)
      if (event.type === 'AGENT_TAB_SWITCH') {
        const { tab } = event.payload;
        console.log(`[ChatContext] AGENT_TAB_SWITCH received: ${tab}`);
        setLeftTab(tab);
      }

      // 5. Agent Diff Mode (The Hands - Diff Toggle)
      if (event.type === 'AGENT_DIFF_MODE') {
        const { enable } = event.payload;
        console.log(`[ChatContext] AGENT_DIFF_MODE received: ${enable}`);
        setIsDiffMode(enable);
      }

      // 6. Agent Plan Created (Phase 12.2 - Deliberative Reasoning)
      if (event.type === 'AGENT_PLAN_CREATED') {
        console.log('[Plan Created]', event.payload.plan);
        // Optional: Add system message to show plan in UI
        // addLocalMessage({ id: `plan-${Date.now()}`, role: 'system', content: `Plan: ${event.payload.plan.goal}`, timestamp: Date.now() });
      }
    });

    return unsubscribe;
  }, [navigateToCode, setLeftTab, setIsDiffMode]);

  // --- ACTIONS ---

  const sendMessage = async (text: string) => {
    // 1. Update Local UI immediately (Optimistic)
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

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

  const addLocalMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const upsertMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === message.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = message;
        return copy;
      }
      return [...prev, message];
    });
  }, []);

  const updateUserContext = useCallback((updates: Partial<UserContextState>) => {
    userContextRef.current = { ...userContextRef.current, ...updates };
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
  }, []);

  const exportSessionLogs = useCallback(() => {
    const sessionData = {
      timestamp: new Date().toISOString(),
      pr: prData?.title || 'Unknown',
      messages: messages,
      context: userContextRef.current
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theia-session-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [prData, messages]);

  return (
    <ChatContext.Provider value={{
      messages,
      sendMessage,
      addLocalMessage,
      upsertMessage,
      isTyping,
      resetChat,
      currentModel,
      setModel,
      language,
      setLanguage,
      updateUserContext,
      exportSessionLogs
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
