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
  const { prData, walkthrough, selectionState } = usePR();
  const { upsertMessage } = useChat();
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

  useEffect(() => {
    if (!isActive || !selectionState || !activeSessionRef.current) return;
    activeSessionRef.current.then(session => {
        try {
            // Check if send method exists before calling to avoid crashes
            if (session && typeof session.send === 'function') {
                session.send({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{
                                text: `[SYSTEM CONTEXT UPDATE]: User highlighted code in ${selectionState.file}, lines ${selectionState.startLine}-${selectionState.endLine}. Content: \n${selectionState.content}`
                            }]
                        }],
                        turnComplete: false 
                    }
                });
            } else if (session && typeof (session as any).send === 'function') {
                 // Fallback cast
                 (session as any).send({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{
                                text: `[SYSTEM CONTEXT UPDATE]: User highlighted code in ${selectionState.file}, lines ${selectionState.startLine}-${selectionState.endLine}. Content: \n${selectionState.content}`
                            }]
                        }],
                        turnComplete: false 
                    }
                });
            }
        } catch (e) {
            console.warn("Failed to send context update", e);
        }
    });
  }, [selectionState, isActive]);

  const disconnect = () => {
    if (inputContextRef.current) {
        try { inputContextRef.current.close(); } catch(e) {}
        inputContextRef.current = null;
    }
    if (outputContextRef.current) {
        try { outputContextRef.current.close(); } catch(e) {}
        outputContextRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (processorRef.current) {
        try { processorRef.current.disconnect(); } catch(e) {}
        processorRef.current = null;
    }
    audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    activeSessionRef.current = null;

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
    if (isConnecting || isActive) return;

    try {
        setIsConnecting(true);
        setError(null);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        inputContextRef.current = inputContext;
        const source = inputContext.createMediaStreamSource(stream);
        const processor = inputContext.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(inputContext.destination);

        const outputContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (outputContext.state === 'suspended') {
            await outputContext.resume();
        }
        outputContextRef.current = outputContext;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // --- System Instruction ---
        let systemInstruction = `You are a conversational voice assistant helping a developer review a Pull Request. `;
        systemInstruction += `PR: "${prData.title}" by ${prData.author}. `;
        const filesList = prData.files.map(f => f.path).join(', ');
        systemInstruction += `Changed Files: ${filesList.slice(0, 500)}. `;
        systemInstruction += `If they ask "what is this", refer to the most recent highlighted code context. `;
        
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {}, 
                outputAudioTranscription: {}, 
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                },
                systemInstruction: systemInstruction,
            },
            callbacks: {
                onopen: () => {
                    console.log('Gemini Live Connected');
                    setIsActive(true);
                    setIsConnecting(false);
                    nextStartTimeRef.current = outputContext.currentTime;

                    // Trigger greeting safely
                    setTimeout(() => {
                        sessionPromise.then(session => {
                            const isNewbie = USER_CONFIG.NEWBIE_MODE;
                            const prompt = isNewbie 
                                ? `The user is listening. Say "Hi, I'm your code review assistant." exactly. Then briefly mention you can help with code summaries or finding bugs.`
                                : `The user is listening. Say "Hi, I'm your code review assistant."`;
                                
                            try {
                                const s = session as any;
                                if (typeof s.send === 'function') {
                                    s.send({
                                        clientContent: {
                                            turns: [{ role: 'user', parts: [{ text: prompt }] }],
                                            turnComplete: true
                                        }
                                    });
                                }
                            } catch (e) {
                                console.warn("Failed to trigger greeting", e);
                            }
                        });
                    }, 500);
                },
                onmessage: async (message: LiveServerMessage) => {
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
                    disconnect();
                },
                onerror: (err) => {
                    console.error("Live Error", err);
                    setError("Connection error");
                    disconnect();
                }
            }
        });
        
        sessionPromise.catch(err => {
             setError(err.message || "Failed to connect");
             disconnect();
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
                    session.sendRealtimeInput({
                        media: { mimeType: 'audio/pcm;rate=16000', data: base64Audio }
                    });
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
    <LiveContext.Provider value={{ isActive, isConnecting, connect, disconnect, error, volume }}>
      {children}
    </LiveContext.Provider>
  );
};

export const useLive = () => {
  const context = useContext(LiveContext);
  if (context === undefined) throw new Error('useLive must be used within a LiveProvider');
  return context;
};