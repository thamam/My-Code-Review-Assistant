import { LinearIssue } from '../types';

export class LinearService {
  private static GRAPHQL_URL = 'https://api.linear.app/graphql';

  static async getIssue(apiKey: string, identifier: string): Promise<LinearIssue> {
    // Correct query uses the singular 'issue' field with 'id' argument
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

    const variables = {
      id: identifier.toUpperCase()
    };

    try {
      console.log(`[Linear] Fetching issue ${identifier}...`);
      
      const response = await fetch(this.GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Linear] HTTP Error ${response.status}:`, errorBody);
        throw new Error(`Linear API Error (${response.status}): ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        console.error("[Linear] GraphQL Errors:", result.errors);
        throw new Error(result.errors[0].message || "Unknown GraphQL Error");
      }

      const issue = result.data?.issue;
      if (!issue) {
        console.warn(`[Linear] Issue ${identifier} returned null.`);
        throw new Error(`Issue ${identifier} not found. Check permissions or ID.`);
      }

      return {
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        state: issue.state?.name
      };

    } catch (error: any) {
      console.error("[Linear] Service Failure:", error);
      throw new Error(error.message || "Failed to connect to Linear.");
    }
  }
}