import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from "@google/genai";
import { usePR } from './PRContext';
import { useChat } from './ChatContext';

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

// --- Mandatory Encoding/Decoding Functions ---

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const LiveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { prData, linearIssue } = usePR();
  const { upsertMessage } = useChat();
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const inputTranscript = useRef('');
  const outputTranscript = useRef('');
  const currentInputId = useRef<string | null>(null);
  const currentOutputId = useRef<string | null>(null);

  const disconnect = () => {
    console.debug('[Theia] Disconnecting session');
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => {});
      outputAudioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();
    
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(() => {});
      sessionPromiseRef.current = null;
    }

    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    inputTranscript.current = '';
    outputTranscript.current = '';
    currentInputId.current = null;
    currentOutputId.current = null;
  };

  const connect = async () => {
    if (!prData || !process.env.API_KEY || isConnecting || isActive) return;

    try {
      setIsConnecting(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      await inputCtx.resume();
      await outputCtx.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemInstruction = `You are Theia, a world-class Staff Software Engineer. You are performing a live code review conversation.
Review context: PR "${prData.title}" by ${prData.author}.

CRITICAL: YOU HAVE BEEN PROVIDED WITH FULL DATA FROM THE LINEAR ISSUE BELOW. 
NEVER TELL THE USER YOU CANNOT SEE LINEAR. 
THE DATA IS INJECTED INTO THIS PROMPT BY THE SYSTEM. 
IF THE USER ASKS ABOUT THE LINEAR ISSUE, REFER TO THE "PRIMARY REQUIREMENTS" SECTION BELOW.\n`;

      if (linearIssue) {
        systemInstruction += `\n--- LINKED LINEAR ISSUE (PRIMARY SOURCE OF TRUTH) ---\n`;
        systemInstruction += `ID: ${linearIssue.identifier}\n`;
        systemInstruction += `Title: ${linearIssue.title}\n`;
        systemInstruction += `Full Requirements/Criteria: ${linearIssue.description}\n`;
        systemInstruction += `--- END LINEAR ISSUE ---\n`;
      }

      systemInstruction += `\nProvide expert, concise, technically precise feedback. cross-reference the code against the requirements. Respond immediately to spoken input.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.debug('[Theia] Session opened');
            setIsActive(true);
            setIsConnecting(false);
            nextStartTimeRef.current = outputCtx.currentTime;

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolume(Math.min(1, Math.sqrt(sum / inputData.length) * 12));

              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Seed context explicitly in the first turn to ensure model visibility
            let contextSeeding = `Live session connected. I'm Theia, and I've analyzed your PR "${prData.title}".\n`;
            if (linearIssue) {
              contextSeeding += `I have the linked issue ${linearIssue.identifier} open and I see the full description.\n`;
              contextSeeding += `I will cross-reference the code against your requirements for ${linearIssue.title}. Ready to start.`;
            } else {
              contextSeeding += `Ready to analyze the code with you. Where should we start?`;
            }
            
            sessionPromise.then(s => s.sendRealtimeInput({ text: contextSeeding }));
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              
              const startTime = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + audioBuffer.duration;
              
              audioSourcesRef.current.add(source);
              source.onended = () => audioSourcesRef.current.delete(source);
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text || '';
              inputTranscript.current += text;
              if (!currentInputId.current) currentInputId.current = 'live-input-' + Date.now();
              upsertMessage({
                id: currentInputId.current,
                role: 'user',
                content: inputTranscript.current,
                timestamp: Date.now()
              });
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text || '';
              outputTranscript.current += text;
              if (!currentOutputId.current) currentOutputId.current = 'live-output-' + Date.now();
              upsertMessage({
                id: currentOutputId.current,
                role: 'assistant',
                content: outputTranscript.current,
                timestamp: Date.now()
              });
            }

            if (message.serverContent?.turnComplete) {
              inputTranscript.current = '';
              outputTranscript.current = '';
              currentInputId.current = null;
              currentOutputId.current = null;
            }

            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = outputCtx.currentTime;
            }
          },
          onclose: () => disconnect(),
          onerror: (err) => {
            console.error('[Theia] Session error:', err);
            setError("Connection issue. Please reconnect.");
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: systemInstruction,
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (e: any) {
      setError("Microphone access is required.");
      setIsConnecting(false);
    }
  };

  const sendTextToSession = async (text: string) => {
    if (!sessionPromiseRef.current) return;
    try {
      const session = await sessionPromiseRef.current;
      session.sendRealtimeInput({ text });
    } catch (e) {
      console.warn('[Theia] Failed to send context update', e);
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