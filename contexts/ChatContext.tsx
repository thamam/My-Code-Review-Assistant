
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
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

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, selectionState, linearIssue, activeDiagram } = usePR();
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

      // Build a complete project manifest for the prompt
      const manifest = prData.files.map(f => `- ${f.path} (${f.status})`).join('\n');

      let systemInstruction = `You are Theia, a world-class Staff Software Engineer. 
${langInstruction}

You have access to the full PR context and linked Linear issues. 
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
          contextMsg += `\n\nReviewing Diagram: ${activeDiagram.title}\nDescription: ${activeDiagram.description}`;
      }

      const responseStream = await chatSessionRef.current.sendMessageStream({ message: contextMsg });
      const aiMessageId = (Date.now() + 1).toString();
      let fullResponseText = "";

      setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '', timestamp: Date.now() }]);

      for await (const chunk of responseStream) {
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
