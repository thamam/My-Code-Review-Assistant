/**
 * src/polyfills/async_hooks.ts
 * Polyfill for LangGraph in browser.
 * Provides a minimal AsyncLocalStorage implementation.
 */

export class AsyncLocalStorage<T> {
    private store: T | undefined;

    run<R>(store: T, callback: (...args: unknown[]) => R): R {
        const previousStore = this.store;
        this.store = store;
        try {
            return callback();
        } finally {
            this.store = previousStore;
        }
    }

    getStore(): T | undefined {
        return this.store;
    }

    enterWith(store: T): void {
        this.store = store;
    }

    exit(callback: (...args: unknown[]) => void): void {
        const previousStore = this.store;
        this.store = undefined;
        try {
            callback();
        } finally {
            this.store = previousStore;
        }
    }

    disable(): void {
        this.store = undefined;
    }
}

// Export as default for compatibility
export default { AsyncLocalStorage };
