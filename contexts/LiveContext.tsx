import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { usePR } from './PRContext';
import { useChat } from './ChatContext';

interface LiveContextType {
  isActive: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  volume: number; // 0.0 to 1.0
}

const LiveContext = createContext<LiveContextType | undefined>(undefined);

// Audio Utils
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

  // Refs for cleanup
  const activeSessionRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  // Audio Playback State
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Transcription State
  const inputTranscriptRef = useRef<string>('');
  const outputTranscriptRef = useRef<string>('');
  const currentTurnInputIdRef = useRef<string | null>(null);
  const currentTurnOutputIdRef = useRef<string | null>(null);

  // Send Context Update when Selection Changes
  useEffect(() => {
    if (!isActive || !selectionState || !activeSessionRef.current) return;

    // We send a text part to the model to represent the visual context shift
    // This allows the user to say "What does this code do?" and the model knows "this code" refers to the selection.
    activeSessionRef.current.then(session => {
        try {
            session.send({
                clientContent: {
                    turns: [{
                        role: 'user',
                        parts: [{
                            text: `[SYSTEM CONTEXT UPDATE]: User highlighted code in ${selectionState.file}, lines ${selectionState.startLine}-${selectionState.endLine}. Content: \n${selectionState.content}`
                        }]
                    }],
                    turnComplete: false // Don't trigger a model response, just update context
                }
            });
            console.log("Sent live context update for selection");
        } catch (e) {
            console.warn("Failed to send context update", e);
        }
    });
  }, [selectionState, isActive]);

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

    // 2. Stop Microphone Stream
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    // 3. Stop Processor
    if (processorRef.current) {
        try { processorRef.current.disconnect(); } catch(e) {}
        processorRef.current = null;
    }

    // 4. Stop Playback
    audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // 5. Cleanup Session
    activeSessionRef.current = null;

    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    
    // Reset Transcript Refs
    inputTranscriptRef.current = '';
    outputTranscriptRef.current = '';
    currentTurnInputIdRef.current = null;
    currentTurnOutputIdRef.current = null;
  };

  const connect = async () => {
    if (!prData) {
        setError("No PR loaded to discuss.");
        return;
    }

    // If already connecting or active, ignore
    if (isConnecting || isActive) return;

    try {
        setIsConnecting(true);
        setError(null);

        // --- 1. Setup Audio Inputs (16kHz for Gemini) ---
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        inputContextRef.current = inputContext;
        
        const source = inputContext.createMediaStreamSource(stream);
        
        const processor = inputContext.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(inputContext.destination);

        // --- 2. Setup Audio Output (24kHz for Gemini response) ---
        const outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputContextRef.current = outputContext;

        // --- 3. Initialize Gemini ---
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        let systemInstruction = `You are a conversational voice assistant helping a developer review a Pull Request.\n`;
        systemInstruction += `PR: "${prData.title}" by ${prData.author}.\n`;
        systemInstruction += `Description: ${prData.description.slice(0, 200)}...\n`;
        const filesList = prData.files.map(f => f.path).join(', ');
        systemInstruction += `Changed Files: ${filesList.slice(0, 500)}.\n`;
        if (walkthrough) {
            systemInstruction += `There is a walkthrough titled "${walkthrough.title}".\n`;
        }
        systemInstruction += `IMPORTANT: The user may highlight code on their screen. I will send you hidden context updates when they do. If they ask "what is this", refer to the most recent highlighted code context.`;

        // --- 4. Connect to Live API ---
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
                },
                onmessage: async (message: LiveServerMessage) => {
                    // Handle Audio Output
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

                    // Handle Transcription (Streaming)
                    if (message.serverContent?.inputTranscription?.text) {
                        const text = message.serverContent.inputTranscription.text;
                        inputTranscriptRef.current += text;
                        
                        if (!currentTurnInputIdRef.current) {
                            currentTurnInputIdRef.current = Date.now().toString() + '-voice-user';
                        }
                        upsertMessage({
                            id: currentTurnInputIdRef.current,
                            role: 'user',
                            content: inputTranscriptRef.current,
                            timestamp: Date.now()
                        });
                    }

                    if (message.serverContent?.outputTranscription?.text) {
                        const text = message.serverContent.outputTranscription.text;
                        outputTranscriptRef.current += text;

                        if (!currentTurnOutputIdRef.current) {
                            currentTurnOutputIdRef.current = Date.now().toString() + '-voice-ai';
                        }
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
                        
                        if (currentTurnOutputIdRef.current && outputTranscriptRef.current) {
                             upsertMessage({
                                id: currentTurnOutputIdRef.current,
                                role: 'assistant',
                                content: outputTranscriptRef.current + " (Interrupted)",
                                timestamp: Date.now()
                            });
                        }
                        
                        inputTranscriptRef.current = '';
                        outputTranscriptRef.current = '';
                        currentTurnInputIdRef.current = null;
                        currentTurnOutputIdRef.current = null;
                    }
                },
                onclose: () => {
                    console.log('Gemini Live Closed');
                    disconnect();
                },
                onerror: (err) => {
                    console.error('Gemini Live Error', err);
                    setError("Connection error");
                    disconnect();
                }
            }
        });
        
        sessionPromise.catch(err => {
             console.error("Session connection failed:", err);
             const msg = err.message || "Network error. Please check permissions.";
             setError(msg);
             disconnect();
        });

        activeSessionRef.current = sessionPromise;

        // --- 5. Start Streaming Input ---
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            setVolume(Math.min(1, rms * 5));

            const pcmBuffer = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            const base64Audio = arrayBufferToBase64(pcmBuffer.buffer);

            if (activeSessionRef.current === sessionPromise) {
                sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        media: {
                            mimeType: 'audio/pcm;rate=16000',
                            data: base64Audio
                        }
                    });
                }).catch(() => {});
            }
        };

    } catch (e: any) {
        console.error("Failed to start voice session", e);
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
  if (context === undefined) {
    throw new Error('useLive must be used within a LiveProvider');
  }
  return context;
};