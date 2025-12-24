/**
 * TTSService.ts
 * 
 * Google Cloud Text-to-Speech integration for high-quality voice synthesis.
 * Used in Precision Mode to replace the robotic browser TTS.
 * 
 * Uses the REST API: https://texttospeech.googleapis.com/v1/text:synthesize
 */

export interface TTSConfig {
    languageCode: 'en-US' | 'he-IL';
    voiceName?: string;
}

// Default voices for each language
const DEFAULT_VOICES = {
    'en-US': 'en-US-Journey-F',  // Expressive female voice
    'he-IL': 'he-IL-Wavenet-A',  // Hebrew Wavenet voice
};

/**
 * Synthesizes speech from text using Google Cloud TTS.
 * Returns raw audio data as ArrayBuffer (MP3 format).
 * 
 * @param text - The text to synthesize
 * @param config - Language and voice configuration
 * @returns ArrayBuffer containing MP3 audio data
 * @throws Error if the API call fails
 */
export async function synthesizeSpeech(
    text: string,
    config: TTSConfig = { languageCode: 'en-US' }
): Promise<ArrayBuffer> {
    // Get API key (prefer dedicated Cloud key, fallback to Gemini key with warning)
    let apiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;

    if (!apiKey) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (apiKey) {
            console.warn('[TTSService] Using VITE_GEMINI_API_KEY for Cloud TTS. Consider setting VITE_GOOGLE_CLOUD_API_KEY for production.');
        } else {
            throw new Error('No API key available for Cloud TTS');
        }
    }

    const voiceName = config.voiceName || DEFAULT_VOICES[config.languageCode];

    const requestBody = {
        input: {
            text: text
        },
        voice: {
            languageCode: config.languageCode,
            name: voiceName,
        },
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.0,
            pitch: 0.0,
        }
    };

    console.debug('[TTSService] Synthesizing speech:', {
        textLength: text.length,
        voice: voiceName,
        language: config.languageCode
    });

    const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTSService] API Error:', response.status, errorText);
        throw new Error(`Cloud TTS API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.audioContent) {
        throw new Error('Cloud TTS response missing audioContent');
    }

    // Decode base64 audio content to ArrayBuffer
    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    console.debug('[TTSService] Audio synthesized:', bytes.length, 'bytes');
    return bytes.buffer;
}

/**
 * Plays audio from an ArrayBuffer using Web Audio API.
 * Returns a promise that resolves when playback completes.
 * 
 * @param audioData - ArrayBuffer containing audio data (MP3)
 * @param audioContext - Optional existing AudioContext to reuse
 * @returns Promise that resolves when audio finishes playing
 */
export async function playAudio(
    audioData: ArrayBuffer,
    audioContext?: AudioContext
): Promise<void> {
    const ctx = audioContext || new AudioContext();

    // Decode the MP3 data
    const audioBuffer = await ctx.decodeAudioData(audioData.slice(0)); // slice to avoid detached buffer

    return new Promise((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
            resolve();
        };

        source.start(0);
    });
}

/**
 * High-level function: Synthesize and play speech.
 * Falls back to browser TTS if Cloud TTS fails.
 * 
 * @param text - Text to speak
 * @param language - 'English' or 'Hebrew'
 * @param onSpeakingChange - Callback for speaking state changes
 */
export async function speakWithCloudTTS(
    text: string,
    language: string = 'English',
    onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
    const languageCode = language === 'Hebrew' ? 'he-IL' : 'en-US';

    onSpeakingChange?.(true);

    try {
        const audioData = await synthesizeSpeech(text, { languageCode });
        await playAudio(audioData);
        console.log('[TTSService] Cloud TTS playback complete');
    } catch (error) {
        console.warn('[TTSService] Cloud TTS failed, using browser fallback:', error);

        // Fallback to browser TTS
        return new Promise((resolve) => {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = languageCode;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
        });
    } finally {
        onSpeakingChange?.(false);
    }
}
