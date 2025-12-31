/**
 * src/modules/navigation/NavigationService.ts
 * The Engine: Manages the Repository "Lazy Graph".
 * Handles fetching the directory tree and loading file content on-demand.
 */

import { GitHubService } from '../../../services/github';
import { NavigationState, RepoNode, LazyFile } from './types';

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
            } catch (e) {
                console.error('[NavigationService] Failed to fetch repo tree:', e);
            } finally {
                this.setState({ isLoadingRepoTree: false });
            }
        }

        // 2. Toggle Mode
        this.setState({ isFullRepoMode: !this.state.isFullRepoMode });
    }

    /**
     * Fetches content for a "Ghost" file (one that exists in the tree but not in the PR).
     */
    public async loadGhostFile(owner: string, repo: string, path: string, headSha: string): Promise<LazyFile | null> {
        // 1. Cache Hit Check
        if (this.state.lazyFiles.has(path)) {
            return this.state.lazyFiles.get(path)!;
        }

        // 2. Existence Check in Tree
        const node = this.state.repoTree.find(n => n.path === path && n.type === 'blob');
        if (!node) {
            console.warn(`[NavigationService] File ${path} not found in repo tree`);
            return null;
        }

        try {
            // 3. Fetch Content
            const content = await this.github.fetchFileContent(owner, repo, path, headSha);

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
