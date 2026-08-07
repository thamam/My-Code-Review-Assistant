import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal storage mocks — vitest environment is 'node' so there are no globals.
function createStorageMock() {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = String(value); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  };
}

let mockLocal: ReturnType<typeof createStorageMock>;
let mockSession: ReturnType<typeof createStorageMock>;

beforeEach(() => {
  mockLocal = createStorageMock();
  mockSession = createStorageMock();

  (globalThis as any).localStorage = mockLocal;
  (globalThis as any).sessionStorage = mockSession;

  // Reset env vars
  vi.stubEnv('VITE_GITHUB_TOKEN', '');
  vi.stubEnv('VITE_LINEAR_API_KEY', '');
});

describe('credentials module', () => {
  // Import lazily inside each test so env stubs take effect.
  async function loadModule() {
    vi.resetModules();
    return await import('../../../src/lib/credentials');
  }

  describe('getGitHubToken precedence', () => {
    it('returns env var when present (beats localStorage and sessionStorage)', async () => {
      vi.stubEnv('VITE_GITHUB_TOKEN', 'env-token');
      mockLocal.store['vcr_gh_token'] = 'local-token';
      mockSession.store['vcr_gh_token'] = 'session-token';

      const { getGitHubToken } = await loadModule();
      expect(getGitHubToken()).toBe('env-token');
    });

    it('falls back to localStorage when env is absent', async () => {
      mockLocal.store['vcr_gh_token'] = 'local-token';
      const { getGitHubToken } = await loadModule();
      expect(getGitHubToken()).toBe('local-token');
    });

    it('falls back to sessionStorage when env and localStorage are absent', async () => {
      mockSession.store['vcr_gh_token'] = 'session-token';
      const { getGitHubToken } = await loadModule();
      expect(getGitHubToken()).toBe('session-token');
    });

    it('returns undefined when nothing is set', async () => {
      const { getGitHubToken } = await loadModule();
      expect(getGitHubToken()).toBeUndefined();
    });
  });

  describe('getLinearKey precedence', () => {
    it('returns env var when present', async () => {
      vi.stubEnv('VITE_LINEAR_API_KEY', 'env-linear');
      mockLocal.store['vcr_linear_key'] = 'local-linear';
      const { getLinearKey } = await loadModule();
      expect(getLinearKey()).toBe('env-linear');
    });

    it('falls back to localStorage', async () => {
      mockLocal.store['vcr_linear_key'] = 'local-linear';
      const { getLinearKey } = await loadModule();
      expect(getLinearKey()).toBe('local-linear');
    });

    it('returns undefined when nothing is set', async () => {
      const { getLinearKey } = await loadModule();
      expect(getLinearKey()).toBeUndefined();
    });
  });

  describe('saveGitHubToken remember routing', () => {
    it('stores in localStorage and clears sessionStorage when remember=true', async () => {
      const { saveGitHubToken } = await loadModule();
      mockSession.store['vcr_gh_token'] = 'old-session';

      saveGitHubToken('my-token', true);

      expect(mockLocal.setItem).toHaveBeenCalledWith('vcr_gh_token', 'my-token');
      expect(mockSession.removeItem).toHaveBeenCalledWith('vcr_gh_token');
      expect(mockLocal.store['vcr_gh_token']).toBe('my-token');
      expect(mockSession.store['vcr_gh_token']).toBeUndefined();
    });

    it('stores in sessionStorage and clears localStorage when remember=false', async () => {
      const { saveGitHubToken } = await loadModule();
      mockLocal.store['vcr_gh_token'] = 'old-local';

      saveGitHubToken('my-token', false);

      expect(mockSession.setItem).toHaveBeenCalledWith('vcr_gh_token', 'my-token');
      expect(mockLocal.removeItem).toHaveBeenCalledWith('vcr_gh_token');
      expect(mockSession.store['vcr_gh_token']).toBe('my-token');
      expect(mockLocal.store['vcr_gh_token']).toBeUndefined();
    });
  });

  describe('saveLinearKey', () => {
    it('always writes to localStorage', async () => {
      const { saveLinearKey } = await loadModule();
      saveLinearKey('lin-key');
      expect(mockLocal.setItem).toHaveBeenCalledWith('vcr_linear_key', 'lin-key');
    });
  });
});
