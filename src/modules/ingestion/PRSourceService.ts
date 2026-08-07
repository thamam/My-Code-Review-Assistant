/**
 * src/modules/ingestion/PRSourceService.ts
 * Owns the PR ingestion lifecycle: URL-based fetch (PR or repo mode), the
 * PR-level cache, recent-PR history, and the built-in sample source — so
 * WelcomeScreen is left with form state and UI wiring only.
 */

import { GitHubService } from '../../../services/github';
import { PRData, PRHistoryItem } from '../../../types';
import { SAMPLE_PR } from '../../../mock/samplePR';
import { getGitHubToken } from '../../lib/credentials';

const CACHE_PREFIX = 'vcr_cache_';
const HISTORY_KEY = 'vcr_history';
const HISTORY_CAP = 5;

function cacheKey(url: string): string {
  return `${CACHE_PREFIX}${btoa(url)}`;
}

/**
 * Whether this PRData can be fetched/refreshed remotely.
 * Falls back to owner/repo/headSha presence for PRData persisted before
 * this flag existed (e.g. in vcr_cache_* entries written by an older build).
 */
export function canFetchRemote(data: PRData | null | undefined): boolean {
  if (!data) return false;
  if (typeof data.canFetchRemote === 'boolean') return data.canFetchRemote;
  return !!(data.owner && data.repo && data.headSha);
}

class PRSourceService {
  checkCache(url: string): PRData | null {
    if (!url) return null;
    try {
      const cached = localStorage.getItem(cacheKey(url));
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      console.error('[PRSourceService] Cache check failed', e);
      return null;
    }
  }

  private saveToCache(data: PRData, url: string): void {
    try {
      localStorage.setItem(cacheKey(url), JSON.stringify(data));
    } catch (e) {
      console.warn('[PRSourceService] Failed to save to cache', e);
    }
  }

  getHistory(): PRHistoryItem[] {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  private saveToHistory(data: PRData, url: string): PRHistoryItem[] {
    try {
      const newItem: PRHistoryItem = {
        id: data.id, title: data.title, url, author: data.author, timestamp: Date.now()
      };
      const newHistory = [newItem, ...this.getHistory().filter(h => h.url !== url)].slice(0, HISTORY_CAP);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    } catch (e) {
      console.warn('[PRSourceService] Failed to save history', e);
      return this.getHistory();
    }
  }

  /**
   * Loads a PR or repo URL. Cache-hit short-circuits the network fetch unless
   * forceRefresh is set. A failed fetch rejects and is never written to cache.
   * `tokenOverride`, when provided (e.g. a token just typed into the form),
   * wins over the stored/env credential for this operation only.
   */
  async load(url: string, forceRefresh: boolean = false, tokenOverride?: string): Promise<{ data: PRData; history: PRHistoryItem[] }> {
    if (!forceRefresh) {
      const cached = this.checkCache(url);
      if (cached) {
        return { data: cached, history: this.saveToHistory(cached, url) };
      }
    }

    const service = new GitHubService(tokenOverride ?? getGitHubToken());
    const urlType = service.detectUrlType(url);

    let data: PRData;
    if (urlType === 'pr') {
      data = await service.fetchPR(url);
    } else if (urlType === 'repo') {
      data = await service.fetchRepoMode(url);
    } else {
      throw new Error("Invalid URL. Please enter a GitHub repository or PR URL.");
    }

    this.saveToCache(data, url);
    return { data, history: this.saveToHistory(data, url) };
  }

  /**
   * The sample PR as a true second source: it routes through the same
   * PRData shape as a remote load, and is exempt from cache/history. Its
   * owner ('bmad-method') is mock-backed in GitHubService.fetchRepoTree/
   * fetchFileContent, so canFetchRemote is true — Full Repo Mode and ghost
   * file loads work against those mocks, demonstrating the feature without
   * any real network calls.
   */
  loadSample(): PRData {
    return { ...SAMPLE_PR, canFetchRemote: true };
  }
}

export const prSourceService = new PRSourceService();
