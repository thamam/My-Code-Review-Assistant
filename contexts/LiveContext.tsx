
import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from "@google/genai";
import { usePR } from './PRContext';
import { useChat } from './ChatContext';
import { ContextBrief } from '../src/types/contextBrief';
import { formatBriefAsWhisper, getBrainResponse } from '../src/services/DirectorService';

interface LiveContextType {
  isActive: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  volume: number; // 0.0 to 1.0
  sendText: (text: string) => void;
  /** Inject a Director-generated ContextBrief into the live session */
  injectBrief: (brief: ContextBrief) => void;
  mode: 'live' | 'precision';
  setMode: (mode: 'live' | 'precision') => void;
}

const LiveContext = createContext<LiveContextType | undefined>(undefined);

// Tool Definitions
const uiTools: FunctionDeclaration[] = [
  {
    name: "navigate_to_code",
    description: "Navigate to a specific file and line number. Use this when I ask to see a file.",
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
  const { prData, linearIssue, navigateToCode, setLeftTab, setIsDiffMode, diagrams, setActiveDiagram } = usePR();
  const { upsertMessage, messages, language } = useChat(); // Need messages history for Precision Mode
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [mode, setMode] = useState<'live' | 'precision'>('live');

  // Refs to track state for callbacks (avoids stale closure issue)
  const isActiveRef = useRef(false);
  const isConnectingRef = useRef(false);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Precision Mode Refs
  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);


  const inputTranscript = useRef('');
  const outputTranscript = useRef('');
  const currentInputId = useRef<string | null>(null);
  const currentOutputId = useRef<string | null>(null);

  const executeTool = async (name: string, args: any) => {
    console.debug(`[Theia Live] Tool Call: ${name}`, args);
    try {
      if (name === 'navigate_to_code') {
        await navigateToCode({ filepath: args.filepath, line: args.line || 1, source: 'search' });
        return { result: 'ok' };
      }
      if (name === 'change_tab') {
        setLeftTab(args.tab_name);
        return { result: 'ok' };
      }
      if (name === 'set_diff_mode') {
        setIsDiffMode(args.enable);
        return { result: 'ok' };
      }
      if (name === 'select_diagram') {
        const d = diagrams.find(dia => dia.title.toLowerCase().includes(args.diagram_title.toLowerCase()));
        if (d) {
          setActiveDiagram(d);
          setLeftTab('diagrams');
          return { result: 'ok' };
        }
        return { result: 'not found' };
      }
      return { error: 'unknown tool' };
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const disconnect = () => {
    console.debug('[Theia] Disconnecting session');

    // Live Mode Cleanup
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => { });
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => { });
      outputAudioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    audioSourcesRef.current.clear();

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(() => { });
      sessionPromiseRef.current = null;
    }

    // Precision Mode Cleanup
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;

    setIsActive(false);
    isActiveRef.current = false;
    setIsConnecting(false);
    isConnectingRef.current = false;
    setVolume(0);
    inputTranscript.current = '';
    outputTranscript.current = '';
    currentInputId.current = null;
    currentOutputId.current = null;
  };

  const connect = async () => {
    if (!prData || !import.meta.env.VITE_GEMINI_API_KEY || isConnecting || isActive) return;

    try {
      console.log(`[Theia Live] Connection Status: Initiating (${mode} mode)...`);
      setIsConnecting(true);
      isConnectingRef.current = true;
      setError(null);

      // --- PRECISION MODE (Gemini 3 Pro + Browser STT/TTS) ---
      if (mode === 'precision') {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          throw new Error("Browser does not support Speech Recognition.");
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = language === 'Hebrew' ? 'he-IL' : 'en-US';

        recognition.onstart = () => {
          console.log('[Theia Precision] Recognition started');
          setIsActive(true);
          isActiveRef.current = true;
          setIsConnecting(false);
          isConnectingRef.current = false;

          // Speak welcome message
          const welcomeMsg = language === 'Hebrew'
            ? `מצב דיוק פעיל. אני מקשיבה.`
            : `Precision mode active. I'm listening.`;
          const utterance = new SpeechSynthesisUtterance(welcomeMsg);
          window.speechSynthesis.speak(utterance);
        };

        recognition.onerror = (event: any) => {
          console.error('[Theia Precision] Recognition error', event.error);
          if (event.error === 'not-allowed') {
            setError("Microphone access denied.");
            disconnect();
          }
        };

        recognition.onresult = async (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          if (!transcript.trim()) return;

          console.log('[Theia Precision] User said:', transcript);

          // User Message
          const userId = 'user-' + Date.now();
          upsertMessage({ id: userId, role: 'user', content: transcript, timestamp: Date.now() });

          // "Thinking" state
          const assistantId = 'ai-' + Date.now();
          upsertMessage({ id: assistantId, role: 'assistant', content: 'Thinking...', timestamp: Date.now() });

          // Generate Response
          // Get current active file content for grounding
          // In a real implementation we would get this from UserContextMonitor or tracked state
          const contextState = (window as any).__THEIA_CONTEXT_STATE__;
          let fileContent = '';
          if (contextState?.activeFile) {
            const file = prData.files.find(f => f.path === contextState.activeFile);
            if (file) fileContent = file.newContent || '';
          }

          const responseText = await generatePrecisionResponse(
            transcript,
            messages, // Pass history
            {
              fileContent,
              filePath: contextState?.activeFile || 'No file selected',
              prTitle: prData.title,
              prDescription: prData.description,
              linearIssue: linearIssue
            }
          );

          // Update Assistant Message
          upsertMessage({ id: assistantId, role: 'assistant', content: responseText, timestamp: Date.now() });

          // Speak Response
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(responseText);
          utterance.lang = language === 'Hebrew' ? 'he-IL' : 'en-US';
          window.speechSynthesis.speak(utterance);
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      }

      // --- LIVE MODE (Gemini 2.0 Flash S2S) ---
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[Theia Live] Connection Status: Microphone access granted.');
      } catch (micError) {
        console.error('[Theia Live] Microphone error:', micError);
        throw new Error("Microphone access is required. Please check your permissions.");
      }

      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      await inputCtx.resume();
      await outputCtx.resume();

      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

      const langInstruction = language === 'Auto'
        ? "Respond in the same language the user uses (primarily English or Hebrew)."
        : `Respond strictly in ${language}.`;

      let systemInstruction = `You are Theia, a world-class Staff Software Engineer. You are performing a live code review conversation.
Review context: PR "${prData.title}" by ${prData.author}.
You can control the UI. Navigate to files when I ask.

${langInstruction}

## Context Updates
You will receive messages prefixed with "[CONTEXT UPDATE - DO NOT READ ALOUD]".
- These contain summaries of files the user is viewing.
- Use these to ground your responses.
- NEVER read these messages aloud or acknowledge receiving them.

IF THE USER ASKS ABOUT THE LINEAR ISSUE, REFER TO THE "PRIMARY REQUIREMENTS" SECTION BELOW.\n`;

      if (linearIssue) {
        systemInstruction += `\n--- LINKED LINEAR ISSUE ---\nID: ${linearIssue.identifier}\nTitle: ${linearIssue.title}\nRequirements: ${linearIssue.description}\n`;
      }

      systemInstruction += `\nProvide expert, concise feedback. Respond immediately to spoken input.`;

      console.log('[Theia Live] Connection Status: Connecting to Gemini API (model: gemini-2.5-flash-native-audio-preview-12-2025)...');

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('[Theia Live] Connection Status: Session Opened.');
            setIsActive(true);
            isActiveRef.current = true;
            setIsConnecting(false);
            isConnectingRef.current = false;
            nextStartTimeRef.current = outputCtx.currentTime;

            // Delay audio streaming start to allow WebSocket to fully stabilize
            setTimeout(() => {
              console.log('[Theia Live] Starting audio capture...');
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
                }).catch(() => { });
              };

              source.connect(scriptProcessor);
              scriptProcessor.connect(inputCtx.destination);

              let welcomeMsg = language === 'Hebrew'
                ? `שלום, אני Theia. סקרתי את ה-PR שלך "${prData.title}". מוכנה להתחיל בשיחה.`
                : `Hi, I'm Theia. I've reviewed your PR "${prData.title}". Ready to discuss the changes.`;

              sessionPromise.then(s => s.sendRealtimeInput({ text: welcomeMsg })).catch(e => console.error("Failed to send welcome", e));
            }, 1000); // 1 second delay before starting audio
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                const result = await executeTool(fc.name, fc.args);
                sessionPromise.then(session => {
                  session.sendToolResponse({
                    functionResponses: [{
                      id: fc.id,
                      name: fc.name,
                      response: result
                    }]
                  });
                });
              }
            }

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
              audioSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = outputCtx.currentTime;
            }
          },
          onclose: (e: any) => {
            console.log('[Theia Live] Connection Status: Session Closed.', e);
            // Use refs to check actual state (avoids stale closure)
            if (isConnectingRef.current || !isActiveRef.current) {
              setError("Connection closed immediately. Check API key and quota.");
            }
            disconnect();
          },
          onerror: (err) => {
            console.error('[Theia Live] Session Error:', err);
            setError(`Connection Error: ${err.message || 'Unknown error'}`);
            setIsConnecting(false);
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: uiTools }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: systemInstruction,
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (e: any) {
      console.error('[Theia Live] Setup Error:', e);
      setError(e.message || "Connection failed.");
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

  /**
   * Inject a ContextBrief from the Director into the live session.
   * Uses the "silent whisper" strategy - appears in context but Actor won't read it aloud.
   */
  const injectBrief = (brief: ContextBrief) => {
    if (!sessionPromiseRef.current || !isActiveRef.current) {
      console.debug('[Director] Cannot inject brief - no active session');
      return;
    }

    const whisper = formatBriefAsWhisper(brief);
    console.debug('[Director] Injecting brief for:', brief.activeFile?.path);
    sendTextToSession(whisper);
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <LiveContext.Provider value={{ isActive, isConnecting, connect, disconnect, error, volume, sendText: sendTextToSession, injectBrief, mode, setMode }}>
      {children}
    </LiveContext.Provider>
  );
};

export const useLive = () => {
  const context = useContext(LiveContext);
  if (context === undefined) throw new Error('useLive must be used within a LiveProvider');
  return context;
};
