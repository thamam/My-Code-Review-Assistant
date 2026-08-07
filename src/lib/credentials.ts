/**
 * src/lib/credentials.ts
 * Single source of truth for credential lookup and persistence.
 *
 * Precedence (highest → lowest):
 *   1. Vite env var (build-time config, e.g. VITE_GITHUB_TOKEN in .env)
 *   2. localStorage   (persist across browser sessions — "remember me")
 *   3. sessionStorage  (per-tab session only)
 *   4. undefined       (no credential available)
 */

const GITHUB_TOKEN_KEY = 'vcr_gh_token';
const LINEAR_KEY_KEY = 'vcr_linear_key';

function safeGet(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

function safeRemove(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* noop */
  }
}

export function getGitHubToken(): string | undefined {
  return (
    import.meta.env.VITE_GITHUB_TOKEN ||
    safeGet(localStorage, GITHUB_TOKEN_KEY) ||
    safeGet(sessionStorage, GITHUB_TOKEN_KEY) ||
    undefined
  );
}

export function getLinearKey(): string | undefined {
  return (
    import.meta.env.VITE_LINEAR_API_KEY ||
    safeGet(localStorage, LINEAR_KEY_KEY) ||
    undefined
  );
}

/**
 * Persist a GitHub token.
 * @param remember  true → localStorage (survives restart); false → sessionStorage (per-tab)
 * The opposite storage is always cleared so the two never diverge.
 */
export function saveGitHubToken(token: string, remember: boolean): void {
  if (remember) {
    safeSet(localStorage, GITHUB_TOKEN_KEY, token);
    safeRemove(sessionStorage, GITHUB_TOKEN_KEY);
  } else {
    safeSet(sessionStorage, GITHUB_TOKEN_KEY, token);
    safeRemove(localStorage, GITHUB_TOKEN_KEY);
  }
}

/**
 * Persist a Linear API key.
 * Matches the existing LinearModal policy: only writes to localStorage
 * (Linear does not have a session-vs-persistent toggle in the UI).
 */
export function saveLinearKey(key: string): void {
  safeSet(localStorage, LINEAR_KEY_KEY, key);
}

/** Remove a stored GitHub token from both storages. */
export function clearGitHubToken(): void {
  safeRemove(localStorage, GITHUB_TOKEN_KEY);
  safeRemove(sessionStorage, GITHUB_TOKEN_KEY);
}
