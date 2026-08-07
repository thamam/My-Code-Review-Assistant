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

type StorageKind = 'local' | 'session';

// Resolves the storage object via globalThis *inside* the try — merely
// referencing `localStorage`/`sessionStorage` can throw in some sandboxed
// or privacy-locked-down contexts, so evaluating it outside a try (as a
// bare argument) would escape the catch entirely.
function getStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function safeGet(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(kind: StorageKind, key: string, value: string): void {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}

function safeRemove(kind: StorageKind, key: string): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    /* noop */
  }
}

export function getGitHubToken(): string | undefined {
  return (
    import.meta.env.VITE_GITHUB_TOKEN ||
    safeGet('local', GITHUB_TOKEN_KEY) ||
    safeGet('session', GITHUB_TOKEN_KEY) ||
    undefined
  );
}

export function getLinearKey(): string | undefined {
  return (
    import.meta.env.VITE_LINEAR_API_KEY ||
    safeGet('local', LINEAR_KEY_KEY) ||
    undefined
  );
}

/**
 * Persist a GitHub token.
 * @param remember  true → localStorage (survives restart); false → sessionStorage (per-tab)
 * The opposite storage is always cleared so the two never diverge.
 */
export function saveGitHubToken(token: string, remember: boolean): void {
  const trimmed = token.trim();
  if (remember) {
    safeSet('local', GITHUB_TOKEN_KEY, trimmed);
    safeRemove('session', GITHUB_TOKEN_KEY);
  } else {
    safeSet('session', GITHUB_TOKEN_KEY, trimmed);
    safeRemove('local', GITHUB_TOKEN_KEY);
  }
}

/**
 * Persist a Linear API key.
 * Matches the existing LinearModal policy: only writes to localStorage
 * (Linear does not have a session-vs-persistent toggle in the UI).
 */
export function saveLinearKey(key: string): void {
  safeSet('local', LINEAR_KEY_KEY, key);
}

/** Remove a stored GitHub token from both storages. */
export function clearGitHubToken(): void {
  safeRemove('local', GITHUB_TOKEN_KEY);
  safeRemove('session', GITHUB_TOKEN_KEY);
}
