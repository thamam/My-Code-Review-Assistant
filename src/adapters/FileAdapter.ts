/**
 * FileAdapter.ts
 * 
 * Hexagonal Port: Reads local markdown spec files.
 * Allows users to load requirements from local .md files.
 * 
 * Part of Phase 7: Spec-Driven Traceability Architecture
 */

import { SpecAdapter } from "../types/SpecTypes";

export class FileAdapter implements SpecAdapter {
    readonly adapterType = 'markdown_file' as const;

    /**
     * Fetch content from a file via File API.
     * In browser context, this expects a File object URL or uses the File System Access API.
     * 
     * @param identifier - File path or blob URL
     */
    async fetch(identifier: string): Promise<{ content: string; title: string } | null> {
        try {
            console.log(`[FileAdapter] Reading file: ${identifier}`);

            // Handle blob URLs (from file input)
            if (identifier.startsWith('blob:')) {
                const response = await fetch(identifier);
                const content = await response.text();
                const title = this.extractTitle(content) || 'Untitled Spec';
                return { content, title };
            }

            // Handle regular file paths (for Node.js/testing)
            // In browser, this would need File System Access API
            console.warn('[FileAdapter] Direct file path access not supported in browser');
            return null;

        } catch (error: any) {
            console.error("[FileAdapter] Read failed:", error);
            return null;
        }
    }

    /**
     * Read a File object directly (for file input elements).
     */
    async readFile(file: File): Promise<{ content: string; title: string } | null> {
        try {
            console.log(`[FileAdapter] Reading file: ${file.name}`);

            const content = await file.text();
            const title = this.extractTitle(content) || file.name.replace(/\.md$/, '');

            return { content, title };

        } catch (error: any) {
            console.error("[FileAdapter] Read failed:", error);
            return null;
        }
    }

    /**
     * Extract title from markdown content (first H1 heading).
     */
    private extractTitle(content: string): string | null {
        const match = content.match(/^#\s+(.+)$/m);
        return match ? match[1].trim() : null;
    }
}

/**
 * Singleton instance for convenience.
 */
export const fileAdapter = new FileAdapter();

/**
 * Helper: Open file picker and read selected markdown file.
 * Returns null if user cancels or file read fails.
 */
export async function pickAndReadSpecFile(): Promise<{ content: string; title: string; fileName: string } | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,text/markdown';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            const result = await fileAdapter.readFile(file);
            if (result) {
                resolve({ ...result, fileName: file.name });
            } else {
                resolve(null);
            }
        };

        input.oncancel = () => resolve(null);
        input.click();
    });
}
