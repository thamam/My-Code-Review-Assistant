
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRData } from '../../../types';

// Shared mock instance — PRSourceService constructs GitHubService lazily via
// getGitHubToken(), so every `new GitHubService(...)` call must return this.
const mockGithubInstance = {
    detectUrlType: vi.fn(),
    fetchPR: vi.fn(),
    fetchRepoMode: vi.fn(),
};

vi.mock('../../../services/github', () => ({
    GitHubService: vi.fn().mockImplementation(function () {
        return mockGithubInstance;
    })
}));

vi.mock('../../../src/lib/credentials', () => ({
    getGitHubToken: vi.fn(() => 'test-token')
}));

function createStorageMock() {
    const store: Record<string, string> = {};
    return {
        store,
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = String(value); }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
    };
}

let mockStorage: ReturnType<typeof createStorageMock>;

const makePRData = (overrides: Partial<PRData> = {}): PRData => ({
    id: 'PR-1', title: 'Fix the thing', description: '', author: 'alice',
    baseRef: 'main', headRef: 'feat',
    files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, newContent: 'x' }],
    owner: 'alice', repo: 'repo', headSha: 'sha1',
    ...overrides,
});

describe('PRSourceService', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockStorage = createStorageMock();
        (globalThis as any).localStorage = mockStorage;
    });

    async function loadService() {
        return (await import('../../../src/modules/ingestion/PRSourceService'));
    }

    describe('checkCache', () => {
        it('returns null when nothing is cached', async () => {
            const { prSourceService } = await loadService();
            expect(prSourceService.checkCache('https://github.com/o/r/pull/1')).toBeNull();
        });

        it('returns the cached PRData using the vcr_cache_<base64 url> key', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            const data = makePRData();
            mockStorage.store[`vcr_cache_${btoa(url)}`] = JSON.stringify(data);

            expect(prSourceService.checkCache(url)).toEqual(data);
        });
    });

    describe('load — cache hit/miss/save round-trip', () => {
        it('fetches remotely on cache miss, then saves to cache under the same key scheme', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            const data = makePRData();
            mockGithubInstance.detectUrlType.mockReturnValue('pr');
            mockGithubInstance.fetchPR.mockResolvedValue(data);

            const result = await prSourceService.load(url, false);

            expect(mockGithubInstance.fetchPR).toHaveBeenCalledWith(url);
            expect(result.data).toEqual(data);
            expect(JSON.parse(mockStorage.store[`vcr_cache_${btoa(url)}`])).toEqual(data);
        });

        it('returns cached data without hitting the network when cache hits', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            const data = makePRData();
            mockStorage.store[`vcr_cache_${btoa(url)}`] = JSON.stringify(data);

            const result = await prSourceService.load(url, false);

            expect(mockGithubInstance.fetchPR).not.toHaveBeenCalled();
            expect(mockGithubInstance.fetchRepoMode).not.toHaveBeenCalled();
            expect(result.data).toEqual(data);
        });

        it('bypasses the cache when forceRefresh is true', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            const cached = makePRData({ title: 'stale' });
            const fresh = makePRData({ title: 'fresh' });
            mockStorage.store[`vcr_cache_${btoa(url)}`] = JSON.stringify(cached);
            mockGithubInstance.detectUrlType.mockReturnValue('pr');
            mockGithubInstance.fetchPR.mockResolvedValue(fresh);

            const result = await prSourceService.load(url, true);

            expect(mockGithubInstance.fetchPR).toHaveBeenCalled();
            expect(result.data.title).toBe('fresh');
        });

        it('routes repo URLs through fetchRepoMode', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r';
            const data = makePRData({ files: [] });
            mockGithubInstance.detectUrlType.mockReturnValue('repo');
            mockGithubInstance.fetchRepoMode.mockResolvedValue(data);

            const result = await prSourceService.load(url, false);

            expect(mockGithubInstance.fetchRepoMode).toHaveBeenCalledWith(url);
            expect(result.data).toEqual(data);
        });

        it('throws for an invalid URL without calling the network', async () => {
            const { prSourceService } = await loadService();
            mockGithubInstance.detectUrlType.mockReturnValue('invalid');

            await expect(prSourceService.load('not-a-url', false)).rejects.toThrow(/Invalid URL/);
            expect(mockGithubInstance.fetchPR).not.toHaveBeenCalled();
            expect(mockGithubInstance.fetchRepoMode).not.toHaveBeenCalled();
        });
    });

    describe('history — dedup + cap', () => {
        it('caps history at 5 entries, most recent first', async () => {
            const { prSourceService } = await loadService();
            mockGithubInstance.detectUrlType.mockReturnValue('pr');

            for (let i = 0; i < 6; i++) {
                const url = `https://github.com/o/r/pull/${i}`;
                mockGithubInstance.fetchPR.mockResolvedValue(makePRData({ id: `PR-${i}`, title: `PR ${i}` }));
                await prSourceService.load(url, false);
            }

            const history = prSourceService.getHistory();
            expect(history).toHaveLength(5);
            expect(history[0].title).toBe('PR 5');
            expect(history.some(h => h.title === 'PR 0')).toBe(false);
        });

        it('dedups by url, moving the repeated entry to the front instead of duplicating it', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            mockGithubInstance.detectUrlType.mockReturnValue('pr');
            mockGithubInstance.fetchPR.mockResolvedValue(makePRData({ title: 'first load' }));
            await prSourceService.load(url, false);

            mockGithubInstance.fetchPR.mockResolvedValue(makePRData({ title: 'second load' }));
            await prSourceService.load(url, true); // forceRefresh so it re-fetches instead of cache-hitting

            const history = prSourceService.getHistory();
            expect(history.filter(h => h.url === url)).toHaveLength(1);
            expect(history[0].title).toBe('second load');
        });
    });

    describe('loadSample', () => {
        it('returns PRData with canFetchRemote=false and never touches cache/history', async () => {
            const { prSourceService } = await loadService();

            const data = prSourceService.loadSample();

            expect(data.canFetchRemote).toBe(false);
            expect(data.title).toBeTruthy();
            expect(mockStorage.setItem).not.toHaveBeenCalled();
            expect(prSourceService.getHistory()).toHaveLength(0);
        });
    });

    describe('empty-vs-failed content distinction', () => {
        it('caches data whose file content legitimately resolved to an empty string', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            const data = makePRData({ files: [{ path: 'empty.ts', status: 'added', additions: 0, deletions: 0, newContent: '' }] });
            mockGithubInstance.detectUrlType.mockReturnValue('pr');
            mockGithubInstance.fetchPR.mockResolvedValue(data);

            const result = await prSourceService.load(url, false);

            expect(result.data.files[0].newContent).toBe('');
            expect(mockStorage.store[`vcr_cache_${btoa(url)}`]).toBeDefined();
        });

        it('never caches a PR whose content fetch failed (fetchPR rejects)', async () => {
            const { prSourceService } = await loadService();
            const url = 'https://github.com/o/r/pull/1';
            mockGithubInstance.detectUrlType.mockReturnValue('pr');
            mockGithubInstance.fetchPR.mockRejectedValue(new Error('Failed to fetch content for a.ts (500)'));

            await expect(prSourceService.load(url, false)).rejects.toThrow(/Failed to fetch content/);
            expect(mockStorage.store[`vcr_cache_${btoa(url)}`]).toBeUndefined();
            expect(prSourceService.getHistory()).toHaveLength(0);
        });
    });
});

describe('canFetchRemote', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockStorage = createStorageMock();
        (globalThis as any).localStorage = mockStorage;
    });

    it('returns the explicit flag when present', async () => {
        const { canFetchRemote } = await import('../../../src/modules/ingestion/PRSourceService');
        expect(canFetchRemote(makePRData({ canFetchRemote: false, owner: 'o', repo: 'r', headSha: 's' }))).toBe(false);
        expect(canFetchRemote(makePRData({ canFetchRemote: true, owner: undefined, repo: undefined, headSha: undefined }))).toBe(true);
    });

    it('falls back to owner/repo/headSha presence for pre-existing persisted data with no flag', async () => {
        const { canFetchRemote } = await import('../../../src/modules/ingestion/PRSourceService');
        expect(canFetchRemote(makePRData({ owner: 'o', repo: 'r', headSha: 's' }))).toBe(true);
        expect(canFetchRemote(makePRData({ owner: undefined, repo: undefined, headSha: undefined }))).toBe(false);
    });

    it('returns false for null/undefined', async () => {
        const { canFetchRemote } = await import('../../../src/modules/ingestion/PRSourceService');
        expect(canFetchRemote(null)).toBe(false);
        expect(canFetchRemote(undefined)).toBe(false);
    });
});
