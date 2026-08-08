/**
 * contexts/ChatContext.tsx
 * The Dumb Terminal: Renders state and emits events.
 * Phase 10.3: The Hands - Executes Agent commands via EventBus.
 * No LLM logic allowed.
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '../types/domain';
import { usePR } from './PRContext';
import { getActiveSection } from '../utils/walkthroughUtils';
import { downloadBlob } from '../utils/downloadUtils';
import { resolveActiveFileContent, type ContextSnapshot } from '../types/context';
// Event-Driven Architecture imports
import { eventBus } from '../modules/core/EventBus';
import { agent } from '../modules/core/Agent'; // Force instantiation (Polyfill enabled)
import { simpleChat } from '../modules/core/SimpleChat'; // Force instantiation (Polyfill enabled)
import { runtime } from '../modules/runtime'; // Force runtime instantiation (Phase 11)
import { storageService } from '../modules/persistence'; // For clearing persisted state
import { applyAgentSpeak } from '../lib/chat/applyAgentSpeak';
import type { ChatEngine } from '../modules/core/types';

// Force side-effect execution (prevent tree-shaking)
void agent;
void simpleChat;
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
  engine: ChatEngine;
  setEngine: (engine: ChatEngine) => void;
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
    selectionState,
    isDiffMode,
    focusedLocation,
    walkthrough,
    activeSectionId,
    appMode,
    customReviewGoal,
  } = usePR();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-3.1-pro-preview');
  const [language, setLanguage] = useState<LanguagePreference>('Auto');

  // Engine (Q2): routing preference, same tier as currentModel/language.
  // Persisted globally (not per-PR), default 'simple'.
  const [engine, setEngine] = useState<ChatEngine>(() => {
    try {
      const saved = localStorage.getItem('theia_chat_engine');
      if (saved === 'simple' || saved === 'agent') return saved;
    } catch (e) {
      console.warn('[ChatContext] Failed to read persisted engine preference');
    }
    return 'simple';
  });

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
        setMessages(prev => applyAgentSpeak(prev, event.payload, envelope));
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

  // Engine toggle (Q7): persist preference + append a local divider message.
  // Skip the divider when `engine` hasn't actually changed value — tracking
  // the previous VALUE (not a first-run boolean) survives React.StrictMode's
  // mount→unmount→remount, which would otherwise re-run a first-run flag and
  // append a spurious divider on every mount.
  const prevEngineRef = useRef<ChatEngine | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem('theia_chat_engine', engine);
    } catch (e) {
      console.warn('[ChatContext] Failed to persist engine preference');
    }

    if (prevEngineRef.current === null) {
      prevEngineRef.current = engine;
      return;
    }
    if (prevEngineRef.current === engine) {
      return;
    }
    prevEngineRef.current = engine;

    const divider: ChatMessage = {
      id: `divider-${Date.now()}`,
      role: 'system',
      content: engine === 'agent'
        ? 'Switched to Agent mode. The agent starts a fresh reasoning session and can navigate, run commands, and edit files.'
        : 'Switched to Chat mode. Fast streaming answers; no navigation or terminal.',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, divider]);
  }, [engine]);

  // Per-PR chat history persistence (UI message list, separate from agent state)
  const isLoadingChatRef = useRef(false);

  // Load saved chat history when a PR becomes available.
  // Only replace state if there is saved history AND current messages are just
  // the initial/welcome state (length <= 1) — never clobber an active conversation.
  useEffect(() => {
    const prId = prData?.id;
    if (!prId) return;

    // Cross-PR leak guard: SimpleChat's transcript is in-memory and outlives
    // this effect's own state, so switching PRs must always drop the old
    // one — even when the new PR has no saved history to hydrate from.
    simpleChat.reset();
    // A turn in flight for the old PR is now stale (epoch bumped above) and
    // its 'completed' AGENT_THINKING is suppressed, so isTyping would
    // otherwise be stranded at true — dead send button, no persistence.
    setIsTyping(false);

    const saved = storageService.loadChatHistory(prId);
    if (saved && saved.length > 0 && messages.length <= 1) {
      isLoadingChatRef.current = true;
      setMessages(saved);

      // Q6: hydrate SimpleChat's in-memory transcript from the same restored
      // history, mirroring agent.loadSession() above.
      simpleChat.hydrate(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prData?.id]);

  // Persist chat history on messages change.
  // Skip while a stream/turn is in flight (isTyping) to avoid half-written state.
  useEffect(() => {
    const prId = prData?.id;
    if (!prId) return;
    if (isLoadingChatRef.current) { isLoadingChatRef.current = false; return; }
    if (isTyping) return; // busy: stream/turn in flight
    storageService.saveChatHistory(prId, messages);
  }, [prData?.id, messages, isTyping]);

  // --- ACTIONS ---

  // Refs for dynamic context — prevent stale closures in sendMessage without
  // re-subscribing the EventBus listener (which caused loops/race conditions).
  const selectedFileRef = useRef(selectedFile);
  const focusedLocationRef = useRef(focusedLocation);
  const viewportStateRef = useRef(viewportState);
  const selectionStateRef = useRef(selectionState);
  const isDiffModeRef = useRef(isDiffMode);
  const prDataRef = useRef(prData);
  const walkthroughRef = useRef(walkthrough);
  const activeSectionIdRef = useRef(activeSectionId);
  const currentModelRef = useRef(currentModel);
  const appModeRef = useRef(appMode);
  const customReviewGoalRef = useRef(customReviewGoal);
  const engineRef = useRef(engine);
  const languageRef = useRef(language);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
    focusedLocationRef.current = focusedLocation;
    viewportStateRef.current = viewportState;
    selectionStateRef.current = selectionState;
    isDiffModeRef.current = isDiffMode;
    prDataRef.current = prData;
    walkthroughRef.current = walkthrough;
    activeSectionIdRef.current = activeSectionId;
    currentModelRef.current = currentModel;
    appModeRef.current = appMode;
    customReviewGoalRef.current = customReviewGoal;
    engineRef.current = engine;
    languageRef.current = language;
  }, [selectedFile, focusedLocation, viewportState, selectionState, isDiffMode, prData, walkthrough, activeSectionId, currentModel, appMode, customReviewGoal, engine, language]);

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

    // Build authoritative context snapshot using refs (never stale in closures).
    // Priority: PR file selection > focused navigation location > tab-level activeFile.
    const currentSelectedFile = selectedFileRef.current;
    const currentFocusedLocation = focusedLocationRef.current;
    const vp = viewportStateRef.current;
    const sel = selectionStateRef.current;

    const activeFile =
      currentSelectedFile?.path ??
      currentFocusedLocation?.file ??
      userContextRef.current.activeFile ??
      null;

    // Viewport: prefer focusedLocation line (explicit scroll target) over viewport top
    const viewportStartLine = vp?.startLine ?? null;
    const viewportEndLine = vp?.endLine ?? null;
    const focusedLine = currentFocusedLocation?.line ?? null;

    // F2: Resolve active walkthrough section (if any)
    const activeSection = getActiveSection(walkthroughRef.current, activeSectionIdRef.current);

    // Grounding: pull the active file's content from the selected file itself, so lazily-loaded
    // (ghost) files and deleted files (empty newContent) are grounded correctly, not just PR diff entries.
    const resolvedContent = resolveActiveFileContent(currentSelectedFile);
    const activeFileContent = resolvedContent?.content ?? null;
    const activeFileTruncated = resolvedContent?.truncated ?? false;

    // Exclude activeFile from the base spread — it's set explicitly below with higher-priority logic
    const { activeFile: _af, ...baseContext } = userContextRef.current;
    const contextSnapshot: ContextSnapshot = {
      ...baseContext,
      activeFile,
      activeFileContent,
      activeFileTruncated,
      viewportStartLine,
      viewportEndLine,
      focusedLine,
      isDiffMode: isDiffModeRef.current ?? true,
      // Selected text range (if user highlighted code)
      selectionStartLine: sel?.startLine ?? null,
      selectionEndLine: sel?.endLine ?? null,
      selectionText: sel?.content ?? null,
      // F2: Hierarchical context
      activeSectionTitle: activeSection?.title ?? null,
      activeSectionDescription: activeSection?.description ?? null,
      // Review-intent mode
      appMode: appModeRef.current,
      customReviewGoal: customReviewGoalRef.current,
    };

    console.log('[UI_PROBE] Context snapshot:', contextSnapshot);

    eventBus.emit({
      type: 'USER_MESSAGE',
      payload: {
        text,
        mode: 'text',
        context: contextSnapshot,
        prData: prDataRef.current,
        model: currentModelRef.current,
        engine: engineRef.current,
        language: languageRef.current,
      },
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
    simpleChat.reset();
    // See the mirrored comment in the PR-load effect above: a stale
    // in-flight turn's 'completed' event is suppressed by the epoch bump,
    // so isTyping must be cleared here or it's stranded at true forever.
    setIsTyping(false);
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

    downloadBlob(new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' }), `theia-session-${Date.now()}.json`);
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
      engine,
      setEngine,
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
