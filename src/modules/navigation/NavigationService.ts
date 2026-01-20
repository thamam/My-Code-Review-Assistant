/**
 * src/modules/navigation/NavigationService.ts
 * The Engine: Manages the Repository "Lazy Graph".
 * Handles fetching the directory tree and loading file content on-demand.
 */

import { GitHubService } from '../../../services/github';
import { NavigationState, RepoNode, LazyFile } from './types';
import { eventBus } from '../core/EventBus';
import { searchService } from '../search';

class NavigationService {
    // Initial State
    private state: NavigationState = {
        repoTree: [],
        lazyFiles: new Map(),
        isFullRepoMode: false,
        isLoadingRepoTree: false
    };

    private listeners: Set<(state: NavigationState) => void> = new Set();
    private github: GitHubService;

    constructor() {
        this.github = new GitHubService(import.meta.env.VITE_GITHUB_TOKEN);
    }

    // --- Reactive State Management ---

    public getState(): NavigationState {
        return this.state;
    }

    public subscribe(listener: (state: NavigationState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state); // Sync immediately
        return () => this.listeners.delete(listener);
    }

    private emit() {
        this.listeners.forEach(l => l(this.state));
    }

    private setState(updates: Partial<NavigationState>) {
        this.state = { ...this.state, ...updates };
        this.emit();
    }

    // --- Business Logic (Extracted from PRContext) ---

    /**
     * Toggles "Full Repo Mode". Fetches the git tree if not already loaded.
     */
    public async toggleFullRepoMode(owner: string, repo: string, headSha: string) {
        // 1. If turning on and tree is empty, fetch it
        if (!this.state.isFullRepoMode && this.state.repoTree.length === 0 && !this.state.isLoadingRepoTree) {
            this.setState({ isLoadingRepoTree: true });
            try {
                console.log(`[NavigationService] Fetching repo tree for ${owner}/${repo}...`);
                const tree = await this.github.fetchRepoTree(owner, repo, headSha);
                this.setState({ repoTree: tree });
                console.log(`[NavigationService] Loaded repo tree: ${tree.length} items`);

                // Feed the Librarian (Phase 14)
                const fileList = tree
                    .filter((node: RepoNode) => node.type === 'blob')
                    .map((node: RepoNode) => ({
                        path: node.path,
                        content: '' // Content is empty initially (Ghost Mode)
                    }));
                searchService.indexFiles(fileList);
                console.log(`[NavigationService] Indexed ${fileList.length} files.`);
                // Toggle only on success
                this.setState({ isFullRepoMode: true });
            } catch (e) {
                console.error('[NavigationService] Failed to fetch repo tree:', e);
                // Don't toggle mode on failure
                return;
            } finally {
                this.setState({ isLoadingRepoTree: false });
            }
        } else {
            // 2. Toggle Mode (only when not fetching)
            this.setState({ isFullRepoMode: !this.state.isFullRepoMode });
        }
    }

    /**
     * Fetches content for a "Ghost" file (one that exists in the tree but not in the PR).
     * Instrumented for NFR-006 (Latency < 2s) and NFR-007 (Caching).
     */
    public async loadGhostFile(owner: string, repo: string, path: string, headSha: string): Promise<LazyFile | null> {
        // 1. Cache Hit Check (NFR-007: Caching)
        if (this.state.lazyFiles.has(path)) {
            console.log(`[NavigationService] ⚡ CACHE HIT: ${path} (instant)`);
            return this.state.lazyFiles.get(path)!;
        }
        console.log(`[NavigationService] 🔄 CACHE MISS: ${path} - fetching from API...`);

        // 2. Existence Check in Tree
        const node = this.state.repoTree.find(n => n.path === path && n.type === 'blob');
        if (!node) {
            console.warn(`[NavigationService] File ${path} not found in repo tree`);
            return null;
        }

        // Log file size constraint (NFR-006: < 1MB)
        const fileSizeKB = (node.size || 0) / 1024;
        console.log(`[NavigationService] 📦 File size: ${fileSizeKB.toFixed(2)} KB (limit: 1024 KB)`);
        if (fileSizeKB > 1024) {
            console.warn(`[NavigationService] ⚠️ File exceeds 1MB limit: ${path}`);
        }

        try {
            // 3. Fetch Content with timing (NFR-006: Latency < 2s)
            console.time('GhostFetch');
            const content = await this.github.fetchFileContent(owner, repo, path, headSha);
            console.timeEnd('GhostFetch');

            const lazyFile: LazyFile = {
                path,
                content,
                sha: node.sha,
                size: node.size || 0,
                status: 'warm',
                isReadOnly: true,
                fetchedAt: Date.now()
            };

            // 4. Update State (Immutable)
            const newMap = new Map(this.state.lazyFiles);
            newMap.set(path, lazyFile);
            this.setState({ lazyFiles: newMap });

            // 5. Broadcast to Nervous System (for WebContainer sync)
            eventBus.emit({
                type: 'SYSTEM_FILE_SYNC',
                payload: { path, content }
            });

            console.log(`[NavigationService] Loaded ghost file: ${path}`);
            return lazyFile;

        } catch (e) {
            console.error(`[NavigationService] Failed to load ghost file ${path}:`, e);
            return null;
        }
    }
}

// Export Singleton
export const navigationService = new NavigationService();
