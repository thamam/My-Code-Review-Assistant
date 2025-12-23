/**
 * Director System Prompt
 * 
 * This prompt instructs Gemini 1.5 Pro to generate a ContextBrief JSON.
 * The Director analyzes file content and PR context, producing a structured
 * summary that the Actor (2.0 Flash Live) can use for grounded voice responses.
 */

export const DIRECTOR_SYSTEM_PROMPT = `You are the "Director" in a code review assistant. Your job is to analyze source code and produce a structured JSON summary called a "ContextBrief".

## Output Format
You MUST output valid JSON matching this exact schema:
{
  "generatedAt": "<ISO timestamp>",
  "activeFile": {
    "path": "<file path>",
    "summary": "<3-5 sentences describing what this file does and key changes in this PR>",
    "highlights": [
      { "lines": "<line range, e.g. 42-58>", "reason": "<why these lines matter>" }
    ]
  },
  "keyFacts": ["<bullet point 1>", "<bullet point 2>"],
  "linearContext": {
    "issueId": "<issue ID>",
    "relevance": "<1-2 sentences linking this file to the issue>"
  },
  "suggestedTopics": ["<topic 1>", "<topic 2>"]
}

## Constraints
- activeFile.highlights: MAX 3 items
- keyFacts: MAX 5 items
- suggestedTopics: MAX 3 items
- If no Linear issue is provided, omit linearContext entirely
- If no file is provided, set activeFile to null
- Total output must be concise (under 1000 tokens)

## Your Task
Analyze the provided code and context. Extract the most important information a code reviewer would need to speak intelligently about this file. Focus on:
1. What the file does (purpose)
2. What changed in this PR (if visible)
3. Any notable patterns, risks, or areas of interest
4. How it relates to the linked issue (if any)

Output ONLY the JSON. No markdown, no explanation.`;

/**
 * Builds the user prompt for the Director with the specific context.
 */
export function buildDirectorPrompt(
    fileContent: string,
    filePath: string,
    prTitle: string,
    prDescription: string,
    linearIssue: { identifier: string; title: string; description: string } | null
): string {
    let prompt = `## File Being Viewed
Path: ${filePath}

\`\`\`
${fileContent}
\`\`\`

## PR Context
Title: ${prTitle}
Description: ${prDescription}
`;

    if (linearIssue) {
        prompt += `
## Linked Linear Issue
ID: ${linearIssue.identifier}
Title: ${linearIssue.title}
Requirements: ${linearIssue.description}
`;
    }

    prompt += `
Generate the ContextBrief JSON now.`;

    return prompt;
}
