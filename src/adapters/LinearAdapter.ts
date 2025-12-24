/**
 * LinearAdapter.ts
 * 
 * Hexagonal Port: Fetches requirements from Linear issues.
 * Converts Linear GraphQL response → Markdown content for Atomizer.
 * 
 * Part of Phase 7: Spec-Driven Traceability Architecture
 */

import { SpecAdapter } from "../types/SpecTypes";

interface LinearIssueRaw {
    identifier: string;
    title: string;
    description: string | null;
    url: string;
    state?: { name: string };
}

export class LinearAdapter implements SpecAdapter {
    readonly adapterType = 'linear' as const;

    private static GRAPHQL_URL = 'https://api.linear.app/graphql';
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Fetch a Linear issue and convert to Markdown content.
     * @param identifier - Linear issue ID (e.g., "PROJ-123")
     */
    async fetch(identifier: string): Promise<{ content: string; title: string } | null> {
        const query = `
      query Issue($id: String!) {
        issue(id: $id) {
          identifier
          title
          description
          url
          state {
            name
          }
        }
      }
    `;

        const variables = { id: identifier.toUpperCase() };

        try {
            console.log(`[LinearAdapter] Fetching issue ${identifier}...`);

            const response = await fetch(LinearAdapter.GRAPHQL_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.apiKey
                },
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                console.error(`[LinearAdapter] HTTP Error ${response.status}`);
                return null;
            }

            const result = await response.json();

            if (result.errors) {
                console.error("[LinearAdapter] GraphQL Errors:", result.errors);
                return null;
            }

            const issue: LinearIssueRaw | null = result.data?.issue;
            if (!issue) {
                console.warn(`[LinearAdapter] Issue ${identifier} not found`);
                return null;
            }

            // Convert to Markdown format for Atomizer
            const content = this.toMarkdown(issue);

            return {
                content,
                title: `${issue.identifier}: ${issue.title}`
            };

        } catch (error: any) {
            console.error("[LinearAdapter] Fetch failed:", error);
            return null;
        }
    }

    /**
     * Convert Linear issue to Markdown format.
     */
    private toMarkdown(issue: LinearIssueRaw): string {
        const lines: string[] = [
            `# ${issue.identifier}: ${issue.title}`,
            '',
            `**Status:** ${issue.state?.name || 'Unknown'}`,
            `**URL:** ${issue.url}`,
            '',
            '## Requirements',
            '',
            issue.description || '_No description provided._'
        ];

        return lines.join('\n');
    }
}

/**
 * Factory function for creating LinearAdapter with env API key.
 */
export function createLinearAdapter(): LinearAdapter | null {
    const apiKey = import.meta.env.VITE_LINEAR_API_KEY;
    if (!apiKey) {
        console.warn('[LinearAdapter] No API key configured');
        return null;
    }
    return new LinearAdapter(apiKey);
}
