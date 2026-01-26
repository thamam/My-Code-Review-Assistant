/**
 * VoiceService.ts
 * 
 * Phase 2: The Synthesizer - Voice-First Pair Programmer
 * Connects Web Speech API to AGENT_SPEAK events with Dual-Track parsing.
 * 
 * The "News Anchor" pattern:
 * - Listens to AGENT_SPEAK events
 * - Parses Dual-Track JSON (FR-038)
 * - Speaks ONLY the "voice" track (NFR-008: Voice-Code Separation)
 */

import { eventBus } from '../modules/core/EventBus';
import { speakWithCloudTTS } from '../modules/voice/TTSService';

// Voice state
let isSpeaking = false;
let isEnabled = true;
let unsubscribe: (() => void) | null = null;

// Speech synthesis instance for browser fallback
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

// Speech recognition setup
const SpeechRecognition = typeof window !== 'undefined' ?
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
let recognition: any = null;

/**
 * Speak text using Web Speech API (browser native).
 * Prefers natural-sounding voices like 'Google US English' or 'Samantha'.
 */
function speakBrowser(text: string): void {
    if (!synth) {
        console.warn('[VoiceService] Speech synthesis not available');
        return;
    }

    // Cancel any ongoing speech
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Try to find a natural-sounding voice
    const voices = synth.getVoices();
    const preferredVoices = [
        'Google US English',
        'Samantha',
        'Alex',
        'Victoria',
        'Karen'
    ];

    for (const preferred of preferredVoices) {
        const found = voices.find(v => v.name.includes(preferred));
        if (found) {
            utterance.voice = found;
            break;
        }
    }

    // Fallback to first English voice
    if (!utterance.voice) {
        const englishVoice = voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) {
            utterance.voice = englishVoice;
        }
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
        isSpeaking = true;
        console.log('[VoiceService] Started speaking');
    };

    utterance.onend = () => {
        isSpeaking = false;
        console.log('[VoiceService] Finished speaking');
    };

    utterance.onerror = (event) => {
        isSpeaking = false;
        console.error('[VoiceService] Speech error:', event.error);
    };

    synth.speak(utterance);
}

/**
 * Stop any ongoing speech.
 */
export function stop(): void {
    if (synth) {
        synth.cancel();
    }
    isSpeaking = false;
    console.log('[VoiceService] Speech stopped');
}

/**
 * Speak text - auto-selects between Cloud TTS and browser TTS.
 * @param text - Text to speak (voice track only, no code)
 * @param useCloudTTS - Whether to use Google Cloud TTS (higher quality)
 */
export async function speak(text: string, useCloudTTS = false): Promise<void> {
    if (!isEnabled) {
        console.log('[VoiceService] Voice disabled, skipping');
        return;
    }

    if (!text || text.trim().length === 0) {
        return;
    }

    console.log('[VoiceService] Speaking:', text.substring(0, 100));

    if (useCloudTTS) {
        try {
            await speakWithCloudTTS(text, 'English', (speaking) => {
                isSpeaking = speaking;
            });
        } catch (error) {
            console.warn('[VoiceService] Cloud TTS failed, falling back to browser:', error);
            speakBrowser(text);
        }
    } else {
        speakBrowser(text);
    }
}

/**
 * Parse Dual-Track JSON and extract the voice track.
 * Falls back to raw text if parsing fails.
 * @param payload - Either Dual-Track JSON string or plain text
 * @returns The voice track to speak
 */
function extractVoiceTrack(payload: string): string {
    try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed.voice === 'string') {
            console.log('[VoiceService] Dual-Track JSON detected, using voice track');
            return parsed.voice;
        }
    } catch {
        // Not JSON - use as-is (legacy fallback)
        console.log('[VoiceService] Plain text detected (legacy mode)');
    }
    return payload;
}

/**
 * Initialize VoiceService - subscribes to AGENT_SPEAK events.
 * Call this once on app start.
 */
export function init(): void {
    if (unsubscribe) {
        console.warn('[VoiceService] Already initialized');
        return;
    }

    console.log('[VoiceService] Initializing...');

    // Wait for voices to load (browser quirk)
    if (synth) {
        synth.getVoices(); // Trigger voice loading

        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = () => {
                console.log('[VoiceService] Voices loaded:', synth.getVoices().length);
            };
        }
    }

    // Subscribe to AGENT_SPEAK events
    unsubscribe = eventBus.subscribe('AGENT_SPEAK', (envelope) => {
        const event = envelope.event;
        if (event.type !== 'AGENT_SPEAK') return;

        const rawPayload = event.payload?.text || '';

        // Extract voice track from Dual-Track JSON (FR-038)
        const voiceText = extractVoiceTrack(rawPayload);

        // Speak it! (NFR-008: Only voice track, never code)
        speak(voiceText);
    });

    console.log('[VoiceService] Subscribed to AGENT_SPEAK events');
}

/**
 * Cleanup VoiceService - unsubscribes from events.
 * Call this on app unmount.
 */
export function cleanup(): void {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    stop();
    console.log('[VoiceService] Cleaned up');
}

/**
 * Enable or disable voice synthesis.
 */
export function setEnabled(enabled: boolean): void {
    isEnabled = enabled;
    if (!enabled) {
        stop();
    }
    console.log(`[VoiceService] Voice ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Check if voice is currently speaking.
 */
export function getIsSpeaking(): boolean {
    return isSpeaking;
}

/**
 * Check if voice is enabled.
 */
export function getIsEnabled(): boolean {
    return isEnabled;
}

/**
 * Start listening for voice commands.
 * Emits VOICE_INPUT on success.
 */
export function startListening(): void {
    if (!isEnabled) {
        console.warn('[VoiceService] Cannot listen: Voice disabled');
        return;
    }

    if (!SpeechRecognition) {
        console.warn('[VoiceService] Speech recognition not supported in this browser');
        return;
    }

    // Stop ensuring no conflicts
    if (recognition) {
        recognition.stop();
    }

    try {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            console.log('[VoiceService] Listening started...');
        };

        recognition.onresult = (event: any) => {
            const text = event.results[0][0].transcript;
            console.log('[VoiceService] Recognized:', text);

            // EMIT VOICE_INPUT (The Sensor)
            eventBus.emit({
                type: 'VOICE_INPUT',
                payload: {
                    text: text,
                    timestamp: Date.now()
                }
            });
        };

        recognition.onerror = (event: any) => {
            console.error('[VoiceService] Recognition error:', event.error);
        };

        recognition.onend = () => {
            console.log('[VoiceService] Listening stopped');
        };

        recognition.start();

    } catch (err) {
        console.error('[VoiceService] Failed to start recognition:', err);
    }
}

/**
 * Stop listening.
 */
export function stopListening(): void {
    if (recognition) {
        recognition.stop();
        console.log('[VoiceService] Manually stopped listening');
    }
}

// Export as singleton-like module
export const voiceService = {
    init,
    cleanup,
    speak,
    stop,
    setEnabled,
    getIsSpeaking,
    getIsEnabled,
    startListening,
    stopListening
};
