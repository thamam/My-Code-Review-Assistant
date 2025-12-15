import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";
import { ChatMessage } from '../types';
import { usePR } from './PRContext';

interface ChatContextType {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  addLocalMessage: (message: ChatMessage) => void;
  upsertMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  isTyping: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, selectedFile, viewportState, selectionState, walkthrough, linearIssue } = usePR();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Ref to hold the active chat session
  const chatSessionRef = useRef<Chat | null>(null);

  const clearMessages = () => {
      setMessages([]);
      // Force re-init of session to clear backend context if needed, though usually new session obj is enough
      chatSessionRef.current = null;
      // Re-trigger the effect to create new session
      // We can hack this by depending on messages length 0, but better to rely on prData/linearIssue change
  };

  // Initialize or Re-initialize Chat Session when PR Data, Walkthrough, or Linear Issue changes
  useEffect(() => {
    if (!prData) return;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Build a robust system prompt with PR context
      let systemInstruction = `You are an expert Senior Software Engineer acting as a code reviewer assistant.\n`;
      systemInstruction += `You are reviewing a Pull Request titled: "${prData.title}" by author: ${prData.author}.\n`;
      systemInstruction += `PR Description: ${prData.description}\n\n`;
      
      if (linearIssue) {
          systemInstruction += `\n--- LINKED LINEAR ISSUE ---\n`;
          systemInstruction += `Issue ID: ${linearIssue.identifier}\n`;
          systemInstruction += `Title: ${linearIssue.title}\n`;
          systemInstruction += `Status: ${linearIssue.state || 'Unknown'}\n`;
          systemInstruction += `Description: ${linearIssue.description}\n`;
          systemInstruction += `--- END LINEAR ISSUE ---\n\n`;
          systemInstruction += `Use the context from the Linear issue to understand the BUSINESS LOGIC and INTENT behind the changes.\n`;
      }

      systemInstruction += `The PR contains changes in the following files:\n`;
      prData.files.forEach(f => {
          systemInstruction += `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions})\n`;
      });

      if (walkthrough) {
          systemInstruction += `\nA specific walkthrough titled "${walkthrough.title}" is currently loaded. It has ${walkthrough.sections.length} sections.\n`;
          walkthrough.sections.forEach((s, i) => {
              systemInstruction += `Section ${i+1}: ${s.title} (Files: ${s.files.join(', ')})\nDescription: ${s.description}\n`;
          });
      }

      systemInstruction += `\nBe concise, helpful, and focus on code quality, potential bugs, and best practices.`;

      // Create the chat session
      chatSessionRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: systemInstruction,
        },
      });

      // If messages are empty (fresh start), add welcome
      if (messages.length === 0) {
        setMessages([
            {
                id: 'welcome',
                role: 'system',
                content: `Welcome! I've analyzed the ${prData.files.length} changed files${linearIssue ? ` and the linked issue ${linearIssue.identifier}` : ''}. Ask me anything about the code!`,
                timestamp: Date.now()
            }
        ]);
      }

    } catch (error) {
      console.error("Failed to initialize Gemini AI:", error);
      setMessages([
        {
          id: 'error',
          role: 'system',
          content: 'Error: Could not connect to AI service. Please check your API configuration.',
          timestamp: Date.now()
        }
      ]);
    }
  }, [prData, walkthrough, linearIssue]);

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
    
    // Determine the context to attach to the UI message (for visual reference)
    const contextMeta = selectionState ? {
        file: selectionState.file,
        lineRange: [selectionState.startLine, selectionState.endLine] as [number, number]
    } : (selectedFile ? {
        file: selectedFile.path,
        lineRange: [viewportState.startLine, viewportState.endLine] as [number, number]
    } : undefined);

    const newUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      context: contextMeta
    };

    setMessages(prev => [...prev, newUserMessage]);
    setIsTyping(true);

    try {
      // Construct the message payload with "invisible" context about the current file view
      let contextAwareMessage = text;
      
      // Inject Selection Context (High Priority)
      if (selectionState) {
          contextAwareMessage += `\n\n--- USER SELECTION CONTEXT ---\n`;
          contextAwareMessage += `The user has HIGHLIGHTED specific lines in file: ${selectionState.file}\n`;
          contextAwareMessage += `Lines: ${selectionState.startLine} to ${selectionState.endLine}\n`;
          contextAwareMessage += `Selected Code Content:\n\`\`\`\n${selectionState.content}\n\`\`\`\n`;
          contextAwareMessage += `If the user asks "what is this", they are referring to the code above.\n`;
          contextAwareMessage += `--- END SELECTION CONTEXT ---`;
      } 
      // Fallback to Viewport Context (Low Priority)
      else if (selectedFile) {
        contextAwareMessage += `\n\n--- VIEWPORT CONTEXT ---\n`;
        contextAwareMessage += `The user is currently viewing file: ${selectedFile.path}\n`;
        if (viewportState.startLine > 0) {
            contextAwareMessage += `Visible lines: ${viewportState.startLine} to ${viewportState.endLine}\n`;
        }
        const contentSnippet = selectedFile.newContent || selectedFile.oldContent || "";
        if (contentSnippet.length > 0) {
            contextAwareMessage += `File Content Preview:\n\`\`\`${selectedFile.path.split('.').pop()}\n${contentSnippet.slice(0, 10000)}\n\`\`\`\n`;
        }
        contextAwareMessage += `--- END VIEWPORT CONTEXT ---`;
      }

      const responseStream = await chatSessionRef.current.sendMessageStream({ 
        message: contextAwareMessage 
      });

      const aiMessageId = (Date.now() + 1).toString();
      let fullResponseText = "";

      // Add placeholder for AI response
      setMessages(prev => [...prev, {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      }]);

      for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullResponseText += chunkText;
          // Update the specific message in the state
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: fullResponseText }
              : msg
          ));
        }
      }

    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: "Sorry, I encountered an error processing your request.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <ChatContext.Provider value={{ messages, sendMessage, addLocalMessage, upsertMessage, isTyping, clearMessages }}>
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