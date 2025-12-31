/**
 * src/modules/navigation/types.ts
 * Domain models for the Navigation Module (Phase 9 Lazy Graph).
 */

export type NodeStatus = 'hot' | 'warm' | 'ghost';

export interface LazyFile {
    path: string;
    content: string | null; // Null for Ghost Nodes
    sha: string;            // From GitHub Tree API
    size: number;
    status: NodeStatus;

    // UX State
    isReadOnly: boolean;
    fetchedAt?: number;
}

export interface RepoNode {
    path: string;
    type: 'blob' | 'tree';
    sha: string;
    mode?: string;
    size?: number;
}

export interface NavigationState {
    repoTree: RepoNode[];
    lazyFiles: Map<string, LazyFile>;
    isFullRepoMode: boolean;
    isLoadingRepoTree: boolean;
}
