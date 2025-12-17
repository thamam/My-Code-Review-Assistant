import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  addLocalMessage: (message: ChatMessage) => void;
  upsertMessage: (message: ChatMessage) => void;
  resetChat: () => void;
  isTyping: boolean;
  currentModel: string;
  setModel: (model: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, selectionState, linearIssue, activeDiagram } = usePR();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentModel, setModel] = useState('gemini-3-pro-preview');
  const [sessionId, setSessionId] = useState(0);
  
  const chatSessionRef = useRef<Chat | null>(null);

  const resetChat = () => {
      if (!prData) return;
      chatSessionRef.current = null;
      setSessionId(prev => prev + 1);
      setMessages([
          {
              id: 'welcome',
              role: 'system',
              content: `Theia connected (Model: ${currentModel}). Analyzing ${prData.files.length} changed files in "${prData.title}". How can I assist with your review?`,
              timestamp: Date.now()
          }
      ]);
  };

  useEffect(() => {
    if (!prData) return;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemInstruction = `You are Theia, a world-class Staff Software Engineer and Architect. 

CRITICAL: YOU HAVE DIRECT ACCESS TO LINEAR ISSUE DATA INJECTED BELOW. 
NEVER TELL THE USER YOU CANNOT SEE LINEAR. 
THE DATA IS PROVIDED IN THIS PROMPT BY THE SYSTEM. 

Focus on:
1. Architectural integrity and design patterns.
2. Performance, security, and scalability.
3. Cross-referencing changes against the Acceptance Criteria provided in the Linear Issue below.

Reviewing PR: "${prData.title}" by ${prData.author}.
PR Description: ${prData.description}\n\n`;
      
      if (linearIssue) {
          systemInstruction += `\n--- LINKED LINEAR ISSUE (PRIMARY SOURCE OF TRUTH) ---\n`;
          systemInstruction += `ID: ${linearIssue.identifier}\n`;
          systemInstruction += `Title: ${linearIssue.title}\n`;
          systemInstruction += `Full Requirements/Criteria: ${linearIssue.description}\n`;
          systemInstruction += `--- END LINEAR ISSUE ---\n\n`;
          systemInstruction += `IMPORTANT: The user expects you to know exactly what is in this issue. Use it to validate if the PR meets the requirements.`;
      }

      systemInstruction += `\nThe PR contains changes in ${prData.files.length} files. Be direct, technically precise, and maintain a professional peer-review tone.`;

      chatSessionRef.current = ai.chats.create({
        model: currentModel,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      if (messages.length === 0) {
        setMessages([
            {
                id: 'welcome',
                role: 'system',
                content: `Theia connected. I've analyzed ${prData.files.length} changed files in "${prData.title}" and reviewed the linked Linear issue. Ready for review.`,
                timestamp: Date.now()
            }
        ]);
      }

    } catch (error) {
      console.error("Failed to initialize Theia:", error);
    }
  }, [prData, linearIssue, currentModel, sessionId]);

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
      let contextAwareMessage = text;
      
      if (selectionState) {
          contextAwareMessage += `\n\n--- CONTEXT: ${selectionState.file} (${selectionState.startLine}-${selectionState.endLine}) ---\n${selectionState.content}\n`;
      } 
      
      if (activeDiagram) {
        contextAwareMessage += `\n\n--- ACTIVE DIAGRAM: ${activeDiagram.title} ---`;
      }

      const responseStream = await chatSessionRef.current.sendMessageStream({ 
        message: contextAwareMessage 
      });

      const aiMessageId = (Date.now() + 1).toString();
      let fullResponseText = "";

      setMessages(prev => [...prev, {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      }]);

      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          setMessages(prev => prev.map(msg => msg.id === aiMessageId ? { ...msg, content: fullResponseText } : msg));
        }
      }
    } catch (error) {
      console.error("Error sending message to Theia:", error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <ChatContext.Provider value={{ messages, sendMessage, addLocalMessage, upsertMessage, isTyping, resetChat, currentModel, setModel }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) throw new Error('useChat must be used within a ChatProvider');
  return context;
};