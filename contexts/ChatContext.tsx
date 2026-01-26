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
import { storageService } from '../src/modules/persistence'; // For clearing persisted state

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
    setIsDiffMode,
    selectedFile,
    viewportState,
    focusedLocation // NEW: Import focusedLocation (Source of Truth for Navigation)
  } = usePR();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-2.0-flash-exp');
  const [language, setLanguage] = useState<LanguagePreference>('Auto');

  // Phase 17: Focus Lock Tracker (FR-042)
  const lastUserInteractionRef = useRef<number>(0);

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

      // Phase 17: Track User Activity for Focus Locking
      if (event.type === 'USER_ACTIVITY') {
        lastUserInteractionRef.current = event.payload.timestamp;
      }

      // 1. Agent Speaks (Output)
      if (event.type === 'AGENT_SPEAK') {
        const content = event.payload.text || event.payload.content || '';
        console.log(`[ChatContext] AGENT_SPEAK received. Content length: ${content.length}`);
        if (content.includes('```mermaid')) {
          console.log('[ChatContext] Mermaid block detected in incoming message!');
        }
        const msg: ChatMessage = {
          id: `ai-${envelope.id}-${envelope.timestamp}`,
          role: 'assistant',
          content: content,
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
        // FR-042: Focus Lock - Don't steal focus if user was active in last 3 seconds
        const timeSinceActivity = Date.now() - lastUserInteractionRef.current;
        if (timeSinceActivity < 3000) {
          console.log(`[ChatContext] AGENT_NAVIGATE suppressed (Focus Lock active: ${timeSinceActivity}ms)`);
          return;
        }

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
        // Apply focus lock here too? Requirement says "navigation", but tab switch is also jarring.
        const timeSinceActivity = Date.now() - lastUserInteractionRef.current;
        if (timeSinceActivity < 3000) {
          console.log('[ChatContext] AGENT_TAB_SWITCH suppressed (Focus Lock active)');
          return;
        }

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

      // 7. Phase 16.2: Session Restoration (The Resurrection)
      if (event.type === 'AGENT_SESSION_RESTORED') {
        const { state } = event.payload;
        console.log('[ChatContext] Session restored from storage');

        // Restore Chat History
        if (state.messages && state.messages.length > 0) {
          // Convert AgentState messages { role, content } to ChatMessage format
          const restoredMessages: ChatMessage[] = state.messages.map((msg: any, i: number) => ({
            id: `restored-${i}-${Date.now()}`,
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
            timestamp: Date.now()
          }));
          setMessages(restoredMessages);
        }

        // Note: Plan restoration is handled separately if PlanContext exists
        // The pendingAction will automatically re-trigger the approval modal
        // because the Agent's internal state already has it.
      }

      // 8. Session Reset (Clear leftovers when loading new repo/PR)
      if (event.type === 'SESSION_RESET') {
        const { repoName } = event.payload;
        console.log(`[ChatContext] SESSION_RESET received - clearing chat for: ${repoName}`);

        // Clear persisted session from localStorage
        storageService.clearState();

        // Clear previous messages
        setMessages([]);

        // Add contextual welcome message
        const welcomeMsg: ChatMessage = {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: `Welcome to **${repoName}**. I'm Theia, your AI code review assistant. How can I help you explore this codebase?`,
          timestamp: Date.now()
        };
        setMessages([welcomeMsg]);
      }

      // 9. Voice Input (The Vocal Sensor)
      if (event.type === 'VOICE_INPUT') {
        console.log('[ChatContext] VOICE_INPUT received:', event.payload.text);
        sendMessage(event.payload.text); // Context is attached inside sendMessage
      }
    });

    return unsubscribe;
  }, [navigateToCode, setLeftTab, setIsDiffMode]);

  // Phase 16.2: Trigger Session Restoration on Mount (Once)
  useEffect(() => {
    agent.loadSession();
  }, []);

  // --- ACTIONS ---

  // Create Refs for dynamic context to ensure sendMessage always sees the latest state
  // without re-subscribing the EventBus listener (which caused loops/race conditions).
  const selectedFileRef = useRef(selectedFile);
  const focusedLocationRef = useRef(focusedLocation);
  const viewportStateRef = useRef(viewportState);
  const prDataRef = useRef(prData);

  // Sync Refs with State
  useEffect(() => {
    selectedFileRef.current = selectedFile;
    focusedLocationRef.current = focusedLocation;
    viewportStateRef.current = viewportState;
    prDataRef.current = prData;
  }, [selectedFile, focusedLocation, viewportState, prData]);

  // --- ACTIONS ---

  const sendMessage = useCallback(async (text: string) => {
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

    // [UI_PROBE] Capturing Context (Using Refs to break closure staleness)
    // Fallback chain: PR Selection -> File System Selection -> Navigation State
    const currentSelectedFile = selectedFileRef.current;
    const currentFocusedLocation = focusedLocationRef.current;
    const realFile = currentSelectedFile?.path || currentFocusedLocation?.file || userContextRef.current.activeFile;

    console.log('[UI_PROBE] Capturing Context:', {
      file: realFile,
      lines: viewportStateRef.current?.startLine,
      source: currentSelectedFile ? 'PR Selection' : (currentFocusedLocation ? 'Focused Location' : 'Fallback')
    });

    eventBus.emit({
      type: 'USER_MESSAGE',
      payload: {
        text,
        mode: 'text',
        context: {
          ...userContextRef.current,
          activeFile: realFile,
          cursorLine: viewportStateRef.current?.startLine
        }, // Pass the view snapshot with authoritative overrides
        prData: prDataRef.current // Pass the data snapshot
      }
    });
  }, []); // Stable reference - never changes

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
    // Expose for testing (Phase 10.4 Smoke Test Hook)
    if (typeof window !== 'undefined') {
      (window as any).__THEIA_CONTEXT_STATE__ = userContextRef.current;
    }
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
  }, []);

  const exportSessionLogs = useCallback(() => {
    // Phase 17: Include Flight Recorder traces (Theia Black Box)
    let traces = [];
    try {
      const stored = localStorage.getItem('theia_flight_log');
      if (stored) {
        traces = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load traces for export');
    }

    const sessionData = {
      timestamp: new Date().toISOString(),
      pr: prData?.title || 'Unknown',
      messages: messages,
      context: userContextRef.current,
      traces: traces // Added traces to export
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
