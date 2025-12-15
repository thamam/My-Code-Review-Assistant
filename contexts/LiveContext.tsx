import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { usePR } from './PRContext';
import { useChat } from './ChatContext';
import { USER_CONFIG } from '../userConfig';

interface LiveContextType {
  isActive: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  volume: number; // 0.0 to 1.0
  sendText: (text: string) => void;
}

const LiveContext = createContext<LiveContextType | undefined>(undefined);

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const LiveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, walkthrough, selectionState, linearIssue, selectedFile } = usePR();
  const { upsertMessage, messages } = useChat();
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  const activeSessionRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const inputTranscriptRef = useRef<string>('');
  const outputTranscriptRef = useRef<string>('');
  const currentTurnInputIdRef = useRef<string | null>(null);
  const currentTurnOutputIdRef = useRef<string | null>(null);
  
  // Debounce refs
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helper to Send Text (Method Discovery) ---
  const sendTextToSession = async (text: string) => {
      if (!activeSessionRef.current) return;
      
      try {
          const session = await activeSessionRef.current;
          
          console.log("[Live] Attempting to send text update");

          const fullPayload = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text: text }]
                }],
                turnComplete: true 
            }
          };

          // Safe send with checks
          if (typeof session.send === 'function') {
              session.send(fullPayload);
              return;
          }
          
          if (typeof (session as any).sendClientContent === 'function') {
               (session as any).sendClientContent(fullPayload.clientContent);
               return;
          }
      } catch (e) {
          console.error("[Live] Failed to send text (session might be closed):", e);
      }
  };

  // 1. Monitor Selection Changes (Debounced)
  useEffect(() => {
    if (!isActive || !selectionState) return;

    if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
    
    selectionTimeoutRef.current = setTimeout(() => {
        const update = `[SYSTEM CONTEXT UPDATE]: User highlighted code in ${selectionState.file}, lines ${selectionState.startLine}-${selectionState.endLine}. Content: \n${selectionState.content}`;
        sendTextToSession(update);
    }, 1000); // 1 second debounce

    return () => { if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current); };
  }, [selectionState, isActive]);

  // 2. Monitor File Navigation Changes (Debounced)
  useEffect(() => {
      if (!isActive || !selectedFile) return;
      
      if (fileTimeoutRef.current) clearTimeout(fileTimeoutRef.current);

      fileTimeoutRef.current = setTimeout(() => {
          const content = selectedFile.newContent || selectedFile.oldContent || "";
          // Injecting content is crucial to prevent the model from guessing/hallucinating file contents.
          // 50k characters is roughly 1000 lines of code, covering most files entirely.
          const contentSnippet = content.slice(0, 50000); 
          
          let update = `[SYSTEM CONTEXT UPDATE]: User navigated to file: ${selectedFile.path}. File Status: ${selectedFile.status}.\n`;
          
          if (contentSnippet) {
              update += `\nFILE CONTENT PREVIEW (Truncated to 50k chars):\n\`\`\`\n${contentSnippet}\n\`\`\`\n`;
          } else {
              update += `\n(File content is empty or could not be loaded)\n`;
          }

          sendTextToSession(update);
      }, 1500); // 1.5 second debounce

      return () => { if (fileTimeoutRef.current) clearTimeout(fileTimeoutRef.current); };
  }, [selectedFile?.path, isActive]);

  const disconnect = () => {
    // 1. Close Audio Contexts
    if (inputContextRef.current) {
        try { inputContextRef.current.close(); } catch(e) {}
        inputContextRef.current = null;
    }
    if (outputContextRef.current) {
        try { outputContextRef.current.close(); } catch(e) {}
        outputContextRef.current = null;
    }
    
    // 2. Stop Media Stream
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (processorRef.current) {
        try { processorRef.current.disconnect(); } catch(e) {}
        processorRef.current = null;
    }

    // 3. Clear Audio Sources
    audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // 4. Close Gemini Session
    if (activeSessionRef.current) {
        const currentPromise = activeSessionRef.current;
        currentPromise.then(session => {
            try { 
                console.log("[Live] Closing session");
                session.close(); 
            } catch (e) { 
                console.error("[Live] Error closing session", e); 
            }
        }).catch(() => {});
        activeSessionRef.current = null;
    }
    
    // Clear timeouts
    if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
    if (fileTimeoutRef.current) clearTimeout(fileTimeoutRef.current);

    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    currentTurnInputIdRef.current = null;
    currentTurnOutputIdRef.current = null;
  };

  const connect = async () => {
    if (!prData) {
        setError("No PR loaded.");
        return;
    }
    if (!process.env.API_KEY) {
        setError("Missing API Key");
        return;
    }
    if (isConnecting || isActive) return;

    try {
        setIsConnecting(true);
        setError(null);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        inputContextRef.current = inputContext;
        const source = inputContext.createMediaStreamSource(stream);
        // INCREASED BUFFER SIZE to 4096 to reduce frequency of WebSocket messages
        const processor = inputContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(inputContext.destination);

        const outputContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (outputContext.state === 'suspended') {
            await outputContext.resume();
        }
        outputContextRef.current = outputContext;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        let systemInstructionText = `You are a conversational voice assistant helping a developer review a Pull Request. `;
        systemInstructionText += `PR: "${prData.title}" by ${prData.author}. `;
        const filesList = prData.files.map(f => f.path).join(', ');
        systemInstructionText += `Changed Files: ${filesList.slice(0, 500)}. `;
        
        if (linearIssue) {
            systemInstructionText += `\nLINKED ISSUE CONTEXT: ${linearIssue.identifier} - ${linearIssue.title}. `;
            systemInstructionText += `Description: ${linearIssue.description.slice(0, 1000)}. `;
        }

        const historyMessages = messages.filter(m => m.id !== 'welcome');

        if (historyMessages.length > 0) {
             systemInstructionText += `\n\nPREVIOUS CONVERSATION HISTORY (Resume from here):\n`;
             historyMessages.slice(-10).forEach(m => { 
                 systemInstructionText += `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}\n`;
             });
             systemInstructionText += `\nNOTE: You are resuming a session. Do NOT introduce yourself again. Just say "I'm ready" or "Listening".`;
        } 

        systemInstructionText += `If they ask "what is this", refer to the most recent highlighted code context. `;
        
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {}, 
                outputAudioTranscription: {}, 
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                },
                // FIXED: System instruction should be a string, not an object
                systemInstruction: systemInstructionText, 
            },
            callbacks: {
                onopen: () => {
                    if (activeSessionRef.current !== sessionPromise) {
                        console.log("[Live] Stale session opened, ignoring.");
                        return;
                    }

                    console.log('Gemini Live Connected');
                    setIsActive(true);
                    setIsConnecting(false);
                    nextStartTimeRef.current = outputContext.currentTime;

                    setTimeout(() => {
                        const silence = new Float32Array(3200); 
                        const pcmBuffer = new Int16Array(silence.length);
                        const base64Audio = arrayBufferToBase64(pcmBuffer.buffer);
                        sessionPromise.then(session => {
                             session.sendRealtimeInput({
                                media: { mimeType: 'audio/pcm;rate=16000', data: base64Audio }
                            });
                        }).catch(e => console.error("[Live] Failed wake-up burst", e));

                        setTimeout(() => {
                            if (activeSessionRef.current !== sessionPromise) return;

                            const hasHistory = messages.filter(m => m.id !== 'welcome').length > 0;
                            const isNewbie = USER_CONFIG.NEWBIE_MODE;
                            
                            let prompt = "";
                            if (hasHistory) {
                                prompt = "Say 'I'm listening' or 'Ready to continue' briefly.";
                            } else {
                                prompt = isNewbie 
                                ? `Say "Hi, I'm your code review assistant." exactly. Then briefly mention you can help.`
                                : `Say "Hi, I'm your code review assistant."`;
                            }
                            sendTextToSession(prompt);
                        }, 500);

                    }, 200);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (activeSessionRef.current !== sessionPromise) return;

                    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                         const pcmData = base64ToUint8Array(audioData);
                         const float32Data = new Float32Array(pcmData.length / 2);
                         const dataView = new DataView(pcmData.buffer);
                         for (let i = 0; i < pcmData.length / 2; i++) {
                             float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
                         }
                         const buffer = outputContext.createBuffer(1, float32Data.length, 24000);
                         buffer.getChannelData(0).set(float32Data);
                         const source = outputContext.createBufferSource();
                         source.buffer = buffer;
                         source.connect(outputContext.destination);
                         const startTime = Math.max(outputContext.currentTime, nextStartTimeRef.current);
                         source.start(startTime);
                         nextStartTimeRef.current = startTime + buffer.duration;
                         audioSourcesRef.current.add(source);
                         source.onended = () => audioSourcesRef.current.delete(source);
                    }

                    if (message.serverContent?.inputTranscription?.text) {
                        inputTranscriptRef.current += message.serverContent.inputTranscription.text;
                        if (!currentTurnInputIdRef.current) currentTurnInputIdRef.current = Date.now().toString() + '-voice-user';
                        upsertMessage({
                            id: currentTurnInputIdRef.current,
                            role: 'user',
                            content: inputTranscriptRef.current,
                            timestamp: Date.now()
                        });
                    }

                    if (message.serverContent?.outputTranscription?.text) {
                        outputTranscriptRef.current += message.serverContent.outputTranscription.text;
                        if (!currentTurnOutputIdRef.current) currentTurnOutputIdRef.current = Date.now().toString() + '-voice-ai';
                        upsertMessage({
                            id: currentTurnOutputIdRef.current,
                            role: 'assistant',
                            content: outputTranscriptRef.current,
                            timestamp: Date.now()
                        });
                    }

                    if (message.serverContent?.turnComplete) {
                        inputTranscriptRef.current = '';
                        outputTranscriptRef.current = '';
                        currentTurnInputIdRef.current = null;
                        currentTurnOutputIdRef.current = null;
                    }

                    if (message.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(s => s.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = outputContext.currentTime;
                        inputTranscriptRef.current = '';
                        outputTranscriptRef.current = '';
                        currentTurnInputIdRef.current = null;
                        currentTurnOutputIdRef.current = null;
                    }
                },
                onclose: () => {
                    if (activeSessionRef.current === sessionPromise) {
                        disconnect();
                    }
                },
                onerror: (err) => {
                    if (activeSessionRef.current === sessionPromise) {
                        console.error("Live Error", err);
                        // Extract useful message if possible
                        const msg = (err as any).message || "Connection error";
                        setError(msg);
                        disconnect();
                    }
                }
            }
        });
        
        sessionPromise.catch(err => {
             if (activeSessionRef.current === sessionPromise) {
                console.error("Live Session Promise catch:", err);
                setError(err.message || "Failed to connect");
                disconnect();
             }
        });

        activeSessionRef.current = sessionPromise;

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            setVolume(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

            const pcmBuffer = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            const base64Audio = arrayBufferToBase64(pcmBuffer.buffer);

            if (activeSessionRef.current === sessionPromise) {
                sessionPromise.then(session => {
                    try {
                        session.sendRealtimeInput({
                            media: { mimeType: 'audio/pcm;rate=16000', data: base64Audio }
                        });
                    } catch (innerErr) {
                         // Silent fail for stream chunks to avoid spamming console
                    }
                }).catch(() => {});
            }
        };

    } catch (e: any) {
        setError(e.message || "Failed to connect");
        disconnect();
    }
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <LiveContext.Provider value={{ isActive, isConnecting, connect, disconnect, error, volume, sendText: sendTextToSession }}>
      {children}
    </LiveContext.Provider>
  );
};

export const useLive = () => {
  const context = useContext(LiveContext);
  if (context === undefined) throw new Error('useLive must be used within a LiveProvider');
  return context;
};