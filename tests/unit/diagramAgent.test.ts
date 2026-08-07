import { describe, it, expect } from 'vitest';
import { extractDiagramReferences } from '../../services/diagramAgent';

describe('extractDiagramReferences', () => {
  it('extracts refs from a flowchart node label', () => {
    const prFiles = ['src/index.ts'];
    const raw = 'flowchart TD\n    A[Start§src/index.ts:5] --> B[Process§src/index.ts:12]';

    const { cleanedCode, references } = extractDiagramReferences(raw, prFiles);

    expect(cleanedCode).toBe('flowchart TD\n    A[Start] --> B[Process]');
    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({ description: 'Start', filepath: 'src/index.ts', line: 5, status: 'valid' });
    expect(references[1]).toMatchObject({ description: 'Process', filepath: 'src/index.ts', line: 12, status: 'valid' });
  });

  it('extracts refs from a class diagram label', () => {
    const prFiles = ['src/models/MyClass.ts'];
    const raw = 'classDiagram\n    class MyClass["MyClass§src/models/MyClass.ts:1"]';

    const { cleanedCode, references } = extractDiagramReferences(raw, prFiles);

    expect(cleanedCode).toBe('classDiagram\n    class MyClass["MyClass"]');
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ description: 'MyClass', filepath: 'src/models/MyClass.ts', line: 1, status: 'valid' });
  });

  it('still extracts refs from a sequence diagram message (backward compatible)', () => {
    const prFiles = ['src/main.py'];
    const raw = 'sequenceDiagram\n    User->>System: Initialize pipeline§src/main.py:42';

    const { cleanedCode, references } = extractDiagramReferences(raw, prFiles);

    expect(cleanedCode).toBe('sequenceDiagram\n    User->>System:Initialize pipeline');
    expect(references[0]).toMatchObject({ description: 'Initialize pipeline', filepath: 'src/main.py', line: 42, status: 'valid' });
  });

  it('marks references to files outside the PR as unresolved', () => {
    const { references } = extractDiagramReferences('A[Start§src/missing.ts:1]', ['src/index.ts']);
    expect(references[0].status).toBe('unresolved');
    expect(references[0].resolvedPath).toBeNull();
  });
});
