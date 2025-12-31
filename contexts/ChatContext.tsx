/**
 * contexts/ChatContext.tsx
 * The Presentation Layer - "Dumb Terminal"
 *
 * Phase 10.2: Lobotomized. No longer contains the Brain.
 * - Emits USER_MESSAGE signals to EventBus
 * - Listens for AGENT_SPEAK and AGENT_THINKING events
 * - Renders state only
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

// Event-Driven Architecture imports
import { eventBus } from '../src/modules/core/EventBus';
import {
    UserMessageEvent,
    AgentSpeakEvent,
    AgentThinkingEvent,
    AgentNavigateEvent,
    UIContext,
    EventEnvelope
} from '../src/modules/core/types';

export type LanguagePreference = 'English' | 'Hebrew' | 'Auto';

// Context State Interface (what the user currently sees)
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
  const {
    prData,
    selectionState,
    linearIssue,
    activeDiagram,
    navigateToCode,
    setLeftTab,
    setIsDiffMode,
    diagrams,
    setActiveDiagram
  } = usePR();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-2.0-flash-exp');
  const [language, setLanguage] = useState<LanguagePreference>(() => {
    try {
      return (localStorage.getItem('theia_lang') as LanguagePreference) || 'Auto';
    } catch { return 'Auto'; }
  });

  // Ref to hold the latest context without triggering re-renders
  const userContextRef = useRef<UserContextState>({
    activeTab: 'files',
    activeFile: null,
    activeSelection: null,
    activeDiagram: null
  });

  // Expose state for E2E testing
  useEffect(() => {
    (window as any).__THEIA_CONTEXT_STATE__ = userContextRef.current;
  });

  // Function to update context (called by Monitor)
  const updateUserContext = (updates: Partial<UserContextState>) => {
    userContextRef.current = { ...userContextRef.current, ...updates };
    (window as any).__THEIA_CONTEXT_STATE__ = userContextRef.current;
  };

  useEffect(() => {
    try { localStorage.setItem('theia_lang', language); } catch { }
  }, [language]);

  // =========================================================================
  // EVENT BUS LISTENERS - The Neural Receivers
  // =========================================================================

  useEffect(() => {
    console.log('[ChatContext] Subscribing to Agent events...');

    // Listen for AGENT_SPEAK events
    const unsubSpeak = eventBus.subscribe('AGENT_SPEAK', (envelope: EventEnvelope) => {
      const event = envelope.event as AgentSpeakEvent;
      const { messageId, content, isStreaming, isFinal } = event.payload;

      if (isStreaming) {
        // Streaming update - upsert the message
        setMessages(prev => {
          const existing = prev.find(m => m.id === messageId);
          if (existing) {
            return prev.map(m => m.id === messageId ? { ...m, content } : m);
          } else {
            // First chunk - add new message
            return [...prev, {
              id: messageId,
              role: 'assistant' as const,
              content,
              timestamp: Date.now()
            }];
          }
        });
      }

      if (isFinal) {
        // Final message - ensure it's in the list
        setMessages(prev => {
          const existing = prev.find(m => m.id === messageId);
          if (existing) {
            return prev.map(m => m.id === messageId ? { ...m, content } : m);
          }
          return [...prev, {
            id: messageId,
            role: 'assistant' as const,
            content,
            timestamp: Date.now()
          }];
        });
      }
    });

    // Listen for AGENT_THINKING events
    const unsubThinking = eventBus.subscribe('AGENT_THINKING', (envelope: EventEnvelope) => {
      const event = envelope.event as AgentThinkingEvent;
      const { stage } = event.payload;

      setIsTyping(stage === 'started' || stage === 'processing');
    });

    // Listen for AGENT_NAVIGATE events (tool execution)
    const unsubNavigate = eventBus.subscribe('AGENT_NAVIGATE', (envelope: EventEnvelope) => {
      const event = envelope.event as AgentNavigateEvent;
      const { target, reason } = event.payload;

      console.log(`[ChatContext] AGENT_NAVIGATE: ${target.file}:${target.line} - ${reason}`);
      navigateToCode({
        filepath: target.file,
        line: target.line,
        source: 'search'
      });
    });

    return () => {
      unsubSpeak();
      unsubThinking();
      unsubNavigate();
    };
  }, [navigateToCode]);

  // =========================================================================
  // MESSAGE HANDLERS
  // =========================================================================

  const addLocalMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const upsertMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      const index = prev.findIndex(m => m.id === message.id);
      if (index >= 0) {
        const newMessages = [...prev];
        newMessages[index] = message;
        return newMessages;
      }
      return [...prev, message];
    });
  }, []);

  const resetChat = useCallback(() => {
    if (!prData) return;

    const welcomeMsg = language === 'Hebrew'
      ? `Theia מחוברת. מנתחת את השינויים ב-"${prData.title}". איך אוכל לעזור היום?`
      : `Theia connected. Analyzing changes in "${prData.title}". How can I help you today?`;

    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: welcomeMsg,
        timestamp: Date.now()
      }
    ]);
  }, [prData, language]);

  // Initialize welcome message when PR loads
  useEffect(() => {
    if (prData && messages.length === 0) {
      resetChat();
    }
  }, [prData, messages.length, resetChat]);

  // =========================================================================
  // SEND MESSAGE - Now just emits to EventBus
  // =========================================================================

  const sendMessage = async (text: string) => {
    if (!prData) return;

    // 1. Add user message to local state immediately
    const userMessageId = Date.now().toString();
    const newUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMessage]);

    // 2. Build context payload (what the agent "sees")
    const context: UIContext = {
      activeTab: userContextRef.current.activeTab,
      activeFile: userContextRef.current.activeFile,
      activeSelection: userContextRef.current.activeSelection,
      activeDiagram: userContextRef.current.activeDiagram,
      prData: prData ? {
        title: prData.title,
        author: prData.author,
        description: prData.description,
        files: prData.files.map(f => ({
          path: f.path,
          status: f.status,
          newContent: f.newContent
        }))
      } : undefined,
      linearIssue: linearIssue ? {
        identifier: linearIssue.identifier,
        title: linearIssue.title,
        description: linearIssue.description
      } : undefined,
      diagrams: diagrams?.map(d => ({ id: d.id, title: d.title }))
    };

    // 3. Emit USER_MESSAGE to EventBus
    const event: UserMessageEvent = {
      type: 'USER_MESSAGE',
      payload: {
        content: text,
        source: 'text',
        context,
        timestamp: Date.now()
      }
    };

    console.log('[ChatContext] Emitting USER_MESSAGE:', { text: text.slice(0, 50), hasContext: !!context });
    eventBus.emit(event, 'ui');
  };

  // =========================================================================
  // UTILITIES
  // =========================================================================

  const exportSessionLogs = useCallback(() => {
    const sessionData = {
      timestamp: new Date().toISOString(),
      pr: prData?.title || 'Unknown',
      messages: messages,
      context: userContextRef.current,
      eventHistory: eventBus.getRecentEvents(50)
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
