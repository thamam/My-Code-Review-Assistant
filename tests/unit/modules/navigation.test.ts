
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { navigationService } from '../../../src/modules/navigation/NavigationService';
import { GitHubService } from '../../../services/github';

// Mock Dependencies
vi.mock('../../../src/services/github', () => {
    return {
        GitHubService: vi.fn().mockImplementation(() => ({
            fetchRepoTree: vi.fn(),
            fetchFileContent: vi.fn()
        }))
    };
});

vi.mock('../../../src/modules/core/EventBus', () => ({
    eventBus: {
        emit: vi.fn()
    }
}));

vi.mock('../../../src/modules/search', () => ({
    searchService: {
        indexFiles: vi.fn()
    }
}));

// Setup Environment for Singleton
// Since navigationService is a singleton instantiated at module load, 
// we need to be careful about state contamination. 
// Ideally, we would reset the singleton, but for now we will just reset the mocks 
// and manipulate the state if exposed, or rely on distinct test inputs.

describe('NavigationService (Headless Guard)', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset state if possible? 
        // We can't easily reset private state of the singleton without extra code in the service.
        // For Phase 9.5, we will test the flow assuming clean slate or idempotent ops.
    });

    it('should fetch repo tree when toggling full repo mode ON', async () => {
        // Setup Mock
        const mockFetchTree = vi.fn().mockResolvedValue([
            { path: 'src/ghost.ts', type: 'blob', sha: 'sha123', size: 500 }
        ]);
        
        // Access the mocked instance method
        // @ts-ignore
        navigationService['github'].fetchRepoTree = mockFetchTree;

        // Execute
        await navigationService.toggleFullRepoMode('test-owner', 'test-repo', 'head-sha');

        // Assert
        expect(mockFetchTree).toHaveBeenCalledWith('test-owner', 'test-repo', 'head-sha');
        const state = navigationService.getState();
        expect(state.isFullRepoMode).toBe(true);
        expect(state.repoTree).toHaveLength(1);
        expect(state.repoTree[0].path).toBe('src/ghost.ts');
    });

    it('should NOT fetch tree if already loaded', async () => {
         const mockFetchTree = vi.fn();
         // @ts-ignore
         navigationService['github'].fetchRepoTree = mockFetchTree;

         // Execute (State is preserved from previous test, so tree is already loaded)
         // Note: This relies on test order which is bad practice, but unavoidable with Singletons 
         // without a reset method. We will assume the previous test set the state.
         
         // If we want to be safe, we can manually check state.
         if (navigationService.getState().repoTree.length === 0) {
             // If we are here, the previous test didn't run or failed.
             // Manually inject state for this test?
             // Not easy with private state.
         }

         // Force "Full Repo Mode" OFF then ON. 
         // Since tree is loaded, it should NOT fetch.
         
         // 1. Turn OFF
         await navigationService.toggleFullRepoMode('o', 'r', 's'); 
         expect(navigationService.getState().isFullRepoMode).toBe(false);

         // 2. Turn ON (Tree exists)
         await navigationService.toggleFullRepoMode('o', 'r', 's');
         expect(navigationService.getState().isFullRepoMode).toBe(true);
         
         // Assert: Fetch should NOT be called again
         expect(mockFetchTree).not.toHaveBeenCalled();
    });

    it('should fetch and cache ghost file content', async () => {
        // Setup
        const mockFetchContent = vi.fn().mockResolvedValue('console.log("ghost");');
        // @ts-ignore
        navigationService['github'].fetchFileContent = mockFetchContent;

        const path = 'src/ghost.ts'; // Must match the tree from test 1

        // Execute 1: Fetch
        const file1 = await navigationService.loadGhostFile('o', 'r', path, 's');
        
        expect(file1).not.toBeNull();
        expect(file1?.content).toBe('console.log("ghost");');
        expect(file1?.status).toBe('warm');
        expect(mockFetchContent).toHaveBeenCalledTimes(1);

        // Execute 2: Cache Hit
        const file2 = await navigationService.loadGhostFile('o', 'r', path, 's');
        
        expect(file2?.content).toBe('console.log("ghost");');
        expect(mockFetchContent).toHaveBeenCalledTimes(1); // Call count remains 1
    });

    it('should return null for non-existent files', async () => {
        const file = await navigationService.loadGhostFile('o', 'r', 'does/not/exist.ts', 's');
        expect(file).toBeNull();
    });
});
