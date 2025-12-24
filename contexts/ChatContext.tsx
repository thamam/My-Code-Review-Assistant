
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from "@google/genai";
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

export type LanguagePreference = 'English' | 'Hebrew' | 'Auto';

// NEW: Define the Context State Interface
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
  updateUserContext: (state: Partial<UserContextState>) => void; // NEW
  exportSessionLogs: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Tool Definitions
const uiTools: FunctionDeclaration[] = [
  {
    name: "navigate_to_code",
    description: "Navigate to a specific file and line number in the code viewer. Use this when the user asks to see a file or specific code lines.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filepath: { type: Type.STRING, description: "Relative path of the file" },
        line: { type: Type.NUMBER, description: "Line number to scroll to (default 1)" }
      },
      required: ["filepath"]
    }
  },
  {
    name: "change_tab",
    description: "Switch the application sidebar tab.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab_name: { type: Type.STRING, enum: ["files", "annotations", "issue", "diagrams"] }
      },
      required: ["tab_name"]
    }
  },
  {
    name: "set_diff_mode",
    description: "Toggle between Diff View (true) and Source View (false).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enable: { type: Type.BOOLEAN }
      },
      required: ["enable"]
    }
  },
  {
    name: "select_diagram",
    description: "Open and display a sequence diagram by searching its title.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        diagram_title: { type: Type.STRING }
      },
      required: ["diagram_title"]
    }
  }
];

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, selectionState, linearIssue, activeDiagram, navigateToCode, setLeftTab, setIsDiffMode, diagrams, setActiveDiagram } = usePR();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-2.0-flash-exp');
  const [language, setLanguage] = useState<LanguagePreference>(() => {
    try {
      return (localStorage.getItem('theia_lang') as LanguagePreference) || 'Auto';
    } catch { return 'Auto'; }
  });
  const [sessionId, setSessionId] = useState(0);

  const chatSessionRef = useRef<Chat | null>(null);

  // NEW: Ref to hold the latest context without triggering re-renders
  const userContextRef = useRef<UserContextState>({
    activeTab: 'files',
    activeFile: null,
    activeSelection: null,
    activeDiagram: null
  });

  // NEW: Expose state for E2E testing
  useEffect(() => {
    (window as any).__THEIA_CONTEXT_STATE__ = userContextRef.current;
  });

  // NEW: Function to update context (called by Monitor)
  const updateUserContext = (updates: Partial<UserContextState>) => {
    userContextRef.current = { ...userContextRef.current, ...updates };
    (window as any).__THEIA_CONTEXT_STATE__ = userContextRef.current;
  };

  useEffect(() => {
    try { localStorage.setItem('theia_lang', language); } catch { }
  }, [language]);

  const resetChat = () => {
    if (!prData) return;
    chatSessionRef.current = null;
    setSessionId(prev => prev + 1);

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
  };

  useEffect(() => {
    if (!prData) return;

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

      const langInstruction = language === 'Auto'
        ? "Respond in the same language the user uses (primarily English or Hebrew)."
        : `Respond strictly in ${language}.`;

      const manifest = prData.files.map(f => `- ${f.path} (${f.status})`).join('\n');

      // PHASE 5: STRICT Anti-Hallucination System Prompt
      let systemInstruction = `You are Theia, a **Senior Staff Software Engineer**. Be direct, not a tutor.
${langInstruction}

## ⚠️ HARD CONSTRAINTS - VIOLATION = FAILURE

### 1. THE PROJECT MANIFEST IS ABSOLUTE TRUTH
The files listed below under "PROJECT MANIFEST" are the ONLY files that changed in this PR.
- **DO NOT invent files that are not in this list.**
- **DO NOT claim more files changed than are listed.**
- If you mention a file, it MUST appear in the manifest below.

### 2. NO GUESSING LINE NUMBERS
- **NEVER cite a line number unless you can see it in the "File Content" section of my message.**
- If I haven't shown you the file content, say: "I need to open that file to see the specific lines" and USE the navigate_to_code tool.
- Wrong: "Check line 44 for the bug" (when you haven't seen the file)
- Right: "Let me navigate to the file first" → [use tool] → "I can see at line X..."

### 3. ACTION OVER ASKING
- **DO NOT ask "Would you like me to show you the file?"**
- **JUST USE THE TOOL and navigate there.**
- Be proactive. If discussing a file, navigate to it.

### 4. GROUNDED RESPONSES ONLY
- Every claim must be backed by evidence visible in the context.
- If you cannot see the code, acknowledge it and take action to see it.

## Your Tools
You have tools to control the UI:
- \`navigate_to_code\`: Jump to a file and line. USE THIS PROACTIVELY.
- \`change_tab\`: Switch sidebar tabs.
- \`set_diff_mode\`: Toggle diff view.
- \`select_diagram\`: Show a diagram.

## Current Context
- Current Tab: ${userContextRef.current.activeTab}
- Open File: ${userContextRef.current.activeFile || 'None'}

## PR Information
PR: "${prData.title}"
Author: ${prData.author}
Description: ${prData.description}

## PROJECT MANIFEST (ONLY these files changed - this is the TRUTH)
${manifest}
`;

      if (linearIssue) {
        systemInstruction += `\n--- LINKED LINEAR ISSUE ---\nID: ${linearIssue.identifier}\nTitle: ${linearIssue.title}\nRequirements: ${linearIssue.description}\n`;
      }

      chatSessionRef.current = ai.chats.create({
        model: currentModel,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: uiTools }]
        },
      });

      if (messages.length === 0) {
        resetChat();
      }

    } catch (error) {
      console.error("Failed to initialize Theia:", error);
    }
  }, [prData, linearIssue, currentModel, sessionId, language]);

  const addLocalMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const upsertMessage = (message: ChatMessage) => {
    setMessages(prev => {
      const index = prev.findIndex(m => m.id === message.id);
      if (index >= 0) {
        const newMessages = [...prev];
        newMessages[index] = message;
        return newMessages;
      }
      return [...prev, message];
    });
  };

  const executeTool = async (name: string, args: any) => {
    console.debug(`[Theia] Executing tool: ${name}`, args);
    try {
      if (name === 'navigate_to_code') {
        const success = await navigateToCode({ filepath: args.filepath, line: args.line || 1, source: 'search' });
        return { result: success ? `Navigated to ${args.filepath}:${args.line}` : `Failed to navigate. File not found.` };
      }
      if (name === 'change_tab') {
        setLeftTab(args.tab_name);
        return { result: `Switched tab to ${args.tab_name}` };
      }
      if (name === 'set_diff_mode') {
        setIsDiffMode(args.enable);
        return { result: `Diff mode set to ${args.enable}` };
      }
      if (name === 'select_diagram') {
        const d = diagrams.find(dia => dia.title.toLowerCase().includes(args.diagram_title.toLowerCase()));
        if (d) {
          setActiveDiagram(d);
          setLeftTab('diagrams');
          return { result: `Selected diagram: ${d.title}` };
        }
        return { result: 'Diagram not found matching title.' };
      }
      return { error: 'Unknown tool' };
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const sendMessage = async (text: string) => {
    if (!chatSessionRef.current) return;

    const userMessageId = Date.now().toString();
    const newUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsTyping(true);

    try {
      let contextMsg = text;

      // PHASE 5: Look up actual file content for grounding (with line numbers)
      let activeFileContent = '';
      const activeFilePath = userContextRef.current.activeFile;
      if (activeFilePath && prData) {
        const fileData = prData.files.find(f => f.path === activeFilePath);
        if (fileData && fileData.newContent) {
          // Add line numbers to help Theia cite specific lines accurately
          const numberedLines = fileData.newContent
            .split('\n')
            .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
            .join('\n');
          activeFileContent = `

[FILE CONTENT - USE THIS FOR LINE REFERENCES]
File: ${activeFilePath}
\`\`\`
${numberedLines}
\`\`\``;
        }
      }

      // Append current context to the message invisibly to the user
      const contextSuffix = `

[SYSTEM INJECTION - CURRENT VIEW]
User is looking at: ${userContextRef.current.activeFile || 'No file open'}
Current Tab: ${userContextRef.current.activeTab}
Selected Text: ${userContextRef.current.activeSelection || 'None'}
Active Diagram: ${userContextRef.current.activeDiagram || 'None'}${activeFileContent}
`;

      // VERIFICATION: Log the context payload for debugging
      console.log('[Theia] Context Payload:', {
        activeFile: userContextRef.current.activeFile,
        hasFileContent: !!activeFileContent,
        contentLength: activeFileContent.length,
        contextSuffixPreview: contextSuffix.substring(0, 500) + (contextSuffix.length > 500 ? '...' : '')
      });

      // We send the context to the model, but we don't display it in the UI (the UI shows 'text')
      // Using 'parts' array format as required by the types, but wrapping the text content
      let responseStream = await chatSessionRef.current.sendMessageStream({
        message: contextMsg + contextSuffix
      });

      const aiMessageId = (Date.now() + 1).toString();
      let fullResponseText = "";
      setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '', timestamp: Date.now() }]);

      for await (const chunk of responseStream) {
        const functionCalls = chunk.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const responses = [];
          for (const call of functionCalls) {
            const result = await executeTool(call.name, call.args);
            responses.push({
              name: call.name,
              response: { result }
            });
          }
          // Send tool output back to model
          responseStream = await chatSessionRef.current.sendMessageStream({
            message: [{ functionResponse: { name: responses[0].name, response: responses[0].response } }]
          });
          for await (const subChunk of responseStream) {
            if (subChunk.text) {
              fullResponseText += subChunk.text;
              setMessages(prev => prev.map(msg => msg.id === aiMessageId ? { ...msg, content: fullResponseText } : msg));
            }
          }
          return;
        }

        if (chunk.text) {
          fullResponseText += chunk.text;
          setMessages(prev => prev.map(msg => msg.id === aiMessageId ? { ...msg, content: fullResponseText } : msg));
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const exportSessionLogs = () => {
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
  };

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
