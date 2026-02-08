import * as Speech from 'expo-speech';

// Options for TTS
interface SpeakOptions {
    rate?: number;
    pitch?: number;
    language?: string;
}

// Default options
const DEFAULT_OPTIONS: SpeakOptions = {
    rate: 0.9,      // Slightly slower for learning
    pitch: 1.0,     // Normal pitch
    language: 'ja', // Japanese
};

/**
 * Speak the given text using the device's TTS engine.
 * @param text The text to speak
 * @param options (Optional) Override default options
 */
export async function speak(text: string, options: SpeakOptions = {}) {
    console.log(`[TTS] Speaking: "${text}"`);
    try {
        const isSpeaking = await Speech.isSpeakingAsync();
        if (isSpeaking) {
            await Speech.stop();
        }

        const effectiveOptions = { ...DEFAULT_OPTIONS, ...options };

        // Use 'ja-JP' locale for better compatibility
        Speech.speak(text, {
            language: 'ja-JP',
            pitch: effectiveOptions.pitch,
            rate: effectiveOptions.rate,
            onDone: () => console.log('[TTS] Finished'),
            onError: (e) => console.warn('[TTS] Error:', e),
        });
    } catch (error) {
        console.warn('[TTS] Catch Error:', error);
    }
}

/**
 * Stop any currently playing speech.
 */
export async function stop() {
    try {
        await Speech.stop();
    } catch (error) {
        console.warn('TTS Stop Error:', error);
    }
}
