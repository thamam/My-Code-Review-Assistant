import { PRData, Walkthrough } from '../types';

export const SAMPLE_PR: PRData = {
  id: 'PR-123',
  title: 'Feature: Implement Visual Code Review',
  description: 'Adds core visualization components for the new review tool.',
  author: 'jdoe',
  baseRef: 'main',
  headRef: 'feature/viz-tool',
  files: [
    {
      path: 'src/components/App.tsx',
      status: 'modified',
      additions: 15,
      deletions: 5,
      oldContent: `import React from 'react';\n\nexport const App = () => {\n  return (\n    <div className="container">\n      <h1>Old App</h1>\n    </div>\n  );\n};`,
      newContent: `import React from 'react';\nimport { FileTree } from './FileTree';\nimport { CodeViewer } from './CodeViewer';\n\nexport const App = () => {\n  return (\n    <div className="flex h-screen bg-gray-900">\n      <FileTree />\n      <CodeViewer />\n    </div>\n  );\n};`
    },
    {
      path: 'src/utils/math.ts',
      status: 'added',
      additions: 12,
      deletions: 0,
      newContent: `export const add = (a: number, b: number) => a + b;\n\nexport const subtract = (a: number, b: number) => a - b;\n\nexport const multiply = (a: number, b: number) => a * b;\n\nexport const divide = (a: number, b: number) => {\n  if (b === 0) throw new Error("Division by zero");\n  return a / b;\n};`
    },
    {
      path: 'src/types/legacy.ts',
      status: 'deleted',
      additions: 0,
      deletions: 10,
      oldContent: `export interface LegacyType {\n  id: number;\n  name: string;\n  deprecated: boolean;\n}\n\nexport const LEGACY_CONST = "old_value";`,
      newContent: ''
    },
    {
        path: 'src/api/client.ts',
        status: 'modified',
        additions: 4,
        deletions: 2,
        oldContent: `const API_URL = "https://api.example.com";\n\nexport async function fetchData() {\n  const res = await fetch(API_URL);\n  return res.json();\n}`,
        newContent: `const API_URL = process.env.API_URL || "https://api.dev.example.com";\n\nexport async function fetchData(endpoint: string) {\n  const res = await fetch(\`\${API_URL}/\${endpoint}\`);\n  if (!res.ok) throw new Error("Network response was not ok");\n  return res.json();\n}`
    },
    {
        path: 'readme.md',
        status: 'modified',
        additions: 2,
        deletions: 1,
        oldContent: `# Project Title\n\nThis is a sample project.`,
        newContent: `# Project Title\n\nThis is a sample project for the Visual Code Review tool.\n\n## Installation\nrun npm install`
    },
    {
        path: 'src/config/constants.ts',
        status: 'unchanged',
        additions: 0,
        deletions: 0,
        oldContent: `export const MAX_RETRIES = 3;\nexport const TIMEOUT = 5000;\nexport const DEFAULT_THEME = 'dark';`,
        newContent: `export const MAX_RETRIES = 3;\nexport const TIMEOUT = 5000;\nexport const DEFAULT_THEME = 'dark';`
    }
  ],
  owner: 'bmad-method',
  repo: 'theia-poc',
  headSha: 'mock-sha-123'
};

export const SAMPLE_WALKTHROUGH: Walkthrough = {
  title: "PR #123: Feature Visualization",
  author: "jdoe",
  sections: [
    {
      id: "sec-1",
      title: "App Component Restructure",
      files: ["src/components/App.tsx"],
      description: "We completely overhauled the App structure to use the new flex layout and introduced the core sub-components.",
      highlights: [
        { file: "src/components/App.tsx", lines: [6, 9], note: "New layout structure" }
      ]
    },
    {
      id: "sec-2",
      title: "New Math Utils",
      files: ["src/utils/math.ts"],
      description: "Added basic mathematical operations to be used in the visual calculations.",
      highlights: [
        { file: "src/utils/math.ts", lines: [7, 10], note: "Division with error handling" }
      ]
    },
    {
        id: "sec-3",
        title: "API Client Update",
        files: ["src/api/client.ts"],
        description: "Updated the API client to support dynamic endpoints and better error handling.",
        highlights: [
            { file: "src/api/client.ts", lines: [1, 1], note: "Env var support" },
            { file: "src/api/client.ts", lines: [5, 5], note: "Added validation" }
        ]
    }
  ]
};
