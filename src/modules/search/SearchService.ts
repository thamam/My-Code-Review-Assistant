import MiniSearch from 'minisearch';

export interface SearchResult {
    id: string; // File path
    score: number;
    match: string; // Snippet
}

class SearchService {
    private engine: MiniSearch;
    private isReady: boolean = false;

    constructor() {
        this.engine = new MiniSearch({
            fields: ['path', 'content'], // Fields to search
            storeFields: ['path'], // Fields to return
            searchOptions: {
                boost: { path: 2 }, // Prefer matches in filenames
                fuzzy: 0.2
            }
        });
    }

    /**
     * Builds the index from the file tree.
     * Note: In a real app, 'content' would be fetched. 
     * For now, we index the paths and potentially snippet content if available.
     */
    public indexFiles(files: { path: string; content?: string }[]) {
        console.log(`[Search] Indexing ${files.length} files...`);
        this.engine.removeAll();

        // Sanitize data for MiniSearch
        const documents = files.map(f => ({
            id: f.path,
            path: f.path,
            content: f.content || '' // Handle ghost files (empty content initially)
        }));

        this.engine.addAll(documents);
        this.isReady = true;
        console.log('[Search] Index ready.');
    }

    public search(query: string): SearchResult[] {
        if (!this.isReady) return [];

        const results = this.engine.search(query, { prefix: true, combineWith: 'AND' });

        return results.map(r => ({
            id: r.id,
            score: r.score,
            match: `Match in ${r.path}` // Simplified match explanation
        })).slice(0, 10); // Limit to top 10
    }
}

export const searchService = new SearchService();
