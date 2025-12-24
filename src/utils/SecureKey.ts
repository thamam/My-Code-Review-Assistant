/**
 * Secure API Key Wrapper
 * 
 * Prevents accidental logging of sensitive credentials.
 * When logged with console.log(), JSON.stringify(), or toString(),
 * the actual key value is hidden and replaced with [REDACTED].
 */

export class SecureKey {
    private readonly _value: string;

    constructor(key: string) {
        this._value = key;
    }

    /** Get the actual key value (use only when making API calls) */
    get value(): string {
        return this._value;
    }

    /** Prevent accidental logging via console.log() */
    toString(): string {
        return '[REDACTED_API_KEY]';
    }

    /** Prevent accidental logging via JSON.stringify() */
    toJSON(): string {
        return '[REDACTED_API_KEY]';
    }

    /** Custom inspect for Node.js environments */
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return '[REDACTED_API_KEY]';
    }
}

/**
 * Usage:
 * 
 * const apiKey = new SecureKey(import.meta.env.VITE_GEMINI_API_KEY);
 * 
 * // Safe - shows [REDACTED_API_KEY]
 * console.log(apiKey);
 * console.log({ key: apiKey });
 * JSON.stringify({ key: apiKey });
 * 
 * // To use with GoogleGenAI:
 * const ai = new GoogleGenAI({ apiKey: apiKey.value });
 */
