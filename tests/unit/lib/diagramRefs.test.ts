import { describe, it, expect } from 'vitest';
import { extractRefs, buildBindingPlan, resolveRefPaths, DiagramRef } from '../../../src/lib/diagramRefs';

describe('extractRefs', () => {
  const cases: { name: string; code: string; cleaned: string; refs: Array<{ description: string; filePath: string; line: number }> }[] = [
    {
      name: 'sequence diagram message',
      code: 'sequenceDiagram\n    User->>System: Initialize pipeline§src/main.py:42',
      cleaned: 'sequenceDiagram\n    User->>System:Initialize pipeline',
      refs: [{ description: 'Initialize pipeline', filePath: 'src/main.py', line: 42 }]
    },
    {
      name: 'flowchart node label with multiple refs on one line',
      code: 'flowchart TD\n    A[Start§src/index.ts:5] --> B[Process§src/index.ts:12]',
      cleaned: 'flowchart TD\n    A[Start] --> B[Process]',
      refs: [
        { description: 'Start', filePath: 'src/index.ts', line: 5 },
        { description: 'Process', filePath: 'src/index.ts', line: 12 }
      ]
    },
    {
      name: 'class diagram label',
      code: 'classDiagram\n    class MyClass["MyClass§src/models/MyClass.ts:1"]',
      cleaned: 'classDiagram\n    class MyClass["MyClass"]',
      refs: [{ description: 'MyClass', filePath: 'src/models/MyClass.ts', line: 1 }]
    },
    {
      name: 'state diagram label',
      code: 'stateDiagram-v2\n    state "Idle§src/machine.ts:8" as s1',
      cleaned: 'stateDiagram-v2\n    state "Idle" as s1',
      refs: [{ description: 'Idle', filePath: 'src/machine.ts', line: 8 }]
    },
    {
      name: 'description containing parens',
      code: 'flowchart TD\n    A[Validate(input)§src/validate.ts:3]',
      cleaned: 'flowchart TD\n    A[Validate(input)]',
      refs: [{ description: 'Validate(input)', filePath: 'src/validate.ts', line: 3 }]
    }
  ];

  cases.forEach(({ name, code, cleaned, refs }) => {
    it(`extracts refs from ${name}`, () => {
      const result = extractRefs(code);
      expect(result.cleanedCode).toBe(cleaned);
      expect(result.refs).toHaveLength(refs.length);
      refs.forEach((expected, i) => {
        expect(result.refs[i]).toMatchObject({ ...expected, ordinal: i });
      });
    });
  });

  it('returns empty output for empty input', () => {
    expect(extractRefs('')).toEqual({ cleanedCode: '', refs: [] });
  });

  it('produces stable, deterministic ids across two extract calls on the same code', () => {
    const code = 'flowchart TD\n    A[Start§src/index.ts:5] --> B[Process§src/index.ts:12]';
    const first = extractRefs(code);
    const second = extractRefs(code);
    expect(second.refs.map(r => r.id)).toEqual(first.refs.map(r => r.id));
    // ids should differ between distinct refs
    expect(first.refs[0].id).not.toBe(first.refs[1].id);
  });

  it('does not use Math.random or Date for ids (no drift across calls)', () => {
    const code = 'A[Only§src/x.ts:1]';
    const ids = new Set([extractRefs(code).refs[0].id, extractRefs(code).refs[0].id, extractRefs(code).refs[0].id]);
    expect(ids.size).toBe(1);
  });
});

describe('buildBindingPlan', () => {
  const ref = (description: string, ordinal: number, overrides: Partial<DiagramRef> = {}): DiagramRef => ({
    id: `id-${ordinal}`,
    description,
    filePath: `src/file${ordinal}.ts`,
    line: ordinal + 1,
    ordinal,
    ...overrides
  });

  it('matches labels to refs by exact trimmed text', () => {
    const refs = [ref('Start', 0), ref('Process', 1)];
    const bindings = buildBindingPlan(['Process', 'Start'], refs);

    expect(bindings).toHaveLength(2);
    expect(bindings.find(b => b.labelIndex === 0)).toMatchObject({ matchedBy: 'text', ref: refs[1] });
    expect(bindings.find(b => b.labelIndex === 1)).toMatchObject({ matchedBy: 'text', ref: refs[0] });
  });

  it('tolerates surrounding whitespace in SVG label text', () => {
    const refs = [ref('Start', 0)];
    const bindings = buildBindingPlan(['  Start  '], refs);
    expect(bindings).toEqual([{ ref: refs[0], labelIndex: 0, matchedBy: 'text' }]);
  });

  it('falls back to ordinal matching for duplicate descriptions when counts match', () => {
    const refs = [ref('Save', 0), ref('Save', 1)];
    const bindings = buildBindingPlan(['Save', 'Save'], refs);

    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toMatchObject({ labelIndex: 0, ref: refs[0], matchedBy: 'ordinal' });
    expect(bindings[1]).toMatchObject({ labelIndex: 1, ref: refs[1], matchedBy: 'ordinal' });
  });

  it('leaves duplicate-description refs unmatched when counts mismatch (no ordinal fallback)', () => {
    const refs = [ref('Save', 0), ref('Save', 1), ref('Save', 2)];
    // Mermaid dropped one element: only 2 rendered labels for 3 refs.
    const bindings = buildBindingPlan(['Save', 'Save'], refs);
    expect(bindings).toHaveLength(0);
  });

  it('does not let an already text-matched ref be re-claimed by ordinal fallback', () => {
    // 'Login' is unique and binds by text wherever it appears; the two
    // 'Save' refs are ambiguous by text and fall back to position — but
    // since counts match, the ref at the 'Login' ref's own ordinal slot
    // must not be re-used once text matching has already claimed it.
    const refs = [ref('Save', 0), ref('Save', 1), ref('Login', 2)];
    const bindings = buildBindingPlan(['Login', 'Save', 'Save'], refs);

    const byLabel = new Map(bindings.map(b => [b.labelIndex, b]));
    expect(byLabel.get(0)).toMatchObject({ ref: refs[2], matchedBy: 'text' });
    expect(byLabel.get(1)).toMatchObject({ ref: refs[1], matchedBy: 'ordinal' });
    // labelIndex 2 would ordinal-fallback to refs[2], but refs[2] was
    // already consumed by the text match above — it stays unmatched
    // rather than being double-bound or misrouted.
    expect(byLabel.has(2)).toBe(false);
  });

  it('returns bindings sorted by labelIndex', () => {
    const refs = [ref('B', 0), ref('A', 1)];
    const bindings = buildBindingPlan(['A', 'B'], refs);
    expect(bindings.map(b => b.labelIndex)).toEqual([0, 1]);
  });
});

describe('resolveRefPaths', () => {
  const ref = (filePath: string): DiagramRef => ({
    id: 'ref-1',
    description: 'desc',
    filePath,
    line: 1,
    ordinal: 0
  });

  it('resolves to the exact current path when unchanged', () => {
    const [resolved] = resolveRefPaths([ref('src/main.ts')], ['src/main.ts', 'src/other.ts']);
    expect(resolved.resolvedPath).toBe('src/main.ts');
  });

  it('resolves a renamed file by unique basename match', () => {
    const [resolved] = resolveRefPaths([ref('old/dir/main.ts')], ['new/dir/main.ts']);
    expect(resolved.resolvedPath).toBe('new/dir/main.ts');
  });

  it('resolves to null when the file was removed', () => {
    const [resolved] = resolveRefPaths([ref('src/deleted.ts')], ['src/main.ts']);
    expect(resolved.resolvedPath).toBeNull();
  });

  it('does not mutate the input refs', () => {
    const original = ref('src/main.ts');
    resolveRefPaths([original], ['src/main.ts']);
    expect(original.resolvedPath).toBeUndefined();
  });
});
