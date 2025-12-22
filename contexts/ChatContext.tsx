
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from "@google/genai";
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

export type LanguagePreference = 'English' | 'Hebrew' | 'Auto';

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
  const [currentModel, setModel] = useState('gemini-3-pro-preview');
  const [language, setLanguage] = useState<LanguagePreference>(() => {
    try {
      return (localStorage.getItem('theia_lang') as LanguagePreference) || 'Auto';
    } catch { return 'Auto'; }
  });
  const [sessionId, setSessionId] = useState(0);
  
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    try { localStorage.setItem('theia_lang', language); } catch {}
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const langInstruction = language === 'Auto' 
        ? "Respond in the same language the user uses (primarily English or Hebrew)." 
        : `Respond strictly in ${language}.`;

      const manifest = prData.files.map(f => `- ${f.path} (${f.status})`).join('\n');

      let systemInstruction = `You are Theia, a world-class Staff Software Engineer. 
${langInstruction}

You have access to the full PR context and linked Linear issues. 
You can control the UI using tools to navigate code, switch tabs, or change views.
Be concise, architecturally minded, and professional.

PR: "${prData.title}"
Author: ${prData.author}
Description: ${prData.description}

## PROJECT MANIFEST (All changed files)
${manifest}
\n`;
      
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
      if (selectionState) {
          contextMsg += `\n\nContext (${selectionState.file} L${selectionState.startLine}-${selectionState.endLine}):\n${selectionState.content}`;
      }
      if (activeDiagram) {
          contextMsg += `\n\nReviewing Diagram: ${activeDiagram.title}`;
      }

      let responseStream = await chatSessionRef.current.sendMessageStream({ message: contextMsg });
      
      const aiMessageId = (Date.now() + 1).toString();
      let fullResponseText = "";
      setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '', timestamp: Date.now() }]);

      for await (const chunk of responseStream) {
        // Handle Function Calls (Tools)
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
            // Send tool output back to model to continue conversation
            responseStream = await chatSessionRef.current.sendMessageStream({
                parts: [{ functionResponse: { name: responses[0].name, response: responses[0].response } }] 
                // Note: Current simplified loop handles single function call return for now
                // In production, handle mapping all functionResponses correctly
            });
            // Continue processing the new stream from the tool response
             for await (const subChunk of responseStream) {
                 if (subChunk.text) {
                     fullResponseText += subChunk.text;
                     setMessages(prev => prev.map(msg => msg.id === aiMessageId ? { ...msg, content: fullResponseText } : msg));
                 }
             }
             return; // Exit after handling tool loop for this turn
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

  return (
    <ChatContext.Provider value={{ messages, sendMessage, addLocalMessage, upsertMessage, isTyping, resetChat, currentModel, setModel, language, setLanguage }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
