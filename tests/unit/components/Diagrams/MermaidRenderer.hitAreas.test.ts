// @vitest-environment jsdom
//
// MermaidRenderer's click-binding is a total no-op for flowchart/class/state
// diagrams under mermaid ^10: the old selector ('.edgePath .path') is mermaid
// v8 markup, and mermaid v10's dagre-wrapper emits `g.edgePaths > path` for
// edges plus `g.nodes > g.node` for nodes instead. jsdom cannot actually run
// mermaid.render() for these diagram types (it calls SVGElement.getBBox,
// which jsdom does not implement — verified empirically), so these fixtures
// are real mermaid 10.9.5 output, captured once via a headless browser from
// the exact cleaned-code shape MermaidRenderer receives at runtime (i.e.
// after extractRefs() has already stripped the §file:line annotations).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HIT_CANDIDATE_SELECTOR, extractLabelText, getHitCandidates } from '../../../../src/components/Diagrams/MermaidRenderer';
import { buildBindingPlan, resolveRefPaths, DiagramRef } from '../../../../src/lib/diagramRefs';

const OLD_V8_SELECTOR = '[class^="messageLine"], .edgePath .path';

const FIXTURES_DIR = join(__dirname, '../../lib/fixtures');

function loadSvg(name: string): SVGElement {
  const markup = readFileSync(join(FIXTURES_DIR, `${name}.svg`), 'utf-8');
  const container = document.createElement('div');
  container.innerHTML = markup;
  const svgEl = container.querySelector('svg');
  if (!svgEl) throw new Error(`fixture ${name}.svg did not parse to an <svg> root`);
  return svgEl;
}

const CASES: Array<{ name: string; refs: Array<{ description: string; filePath: string; line: number }> }> = [
  {
    name: 'flowchart',
    refs: [
      { description: 'Start', filePath: 'src/index.ts', line: 5 },
      { description: 'Process', filePath: 'src/index.ts', line: 12 }
    ]
  },
  {
    name: 'class',
    refs: [
      { description: 'MyClass', filePath: 'src/models/MyClass.ts', line: 1 },
      { description: 'Other', filePath: 'src/models/Other.ts', line: 9 }
    ]
  },
  {
    name: 'state',
    refs: [
      { description: 'Idle', filePath: 'src/machine.ts', line: 8 },
      { description: 'Running', filePath: 'src/machine.ts', line: 20 }
    ]
  }
];

describe('MermaidRenderer hit-area selector (mermaid v10 markup)', () => {
  CASES.forEach(({ name }) => {
    it(`matches a non-zero number of elements for ${name} diagrams`, () => {
      const svgEl = loadSvg(name);

      // The bug: the old v8 selector matches nothing against real v10 markup.
      expect(svgEl.querySelectorAll(OLD_V8_SELECTOR).length).toBe(0);

      // The fix: the current selector does.
      const matches = svgEl.querySelectorAll(HIT_CANDIDATE_SELECTOR);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  CASES.forEach(({ name, refs }) => {
    it(`binds every §file:line ref to its rendered node by text for ${name} diagrams`, () => {
      const svgEl = loadSvg(name);
      // Routed through the same candidate-selection function MermaidRenderer
      // actually calls, not the raw selector, so this exercises production
      // behavior rather than a hand-rolled approximation of it.
      const hitCandidates = getHitCandidates(svgEl);
      const svgLabels = hitCandidates.map(extractLabelText);

      const diagramRefs: DiagramRef[] = refs.map((ref, index) => ({
        id: `id-${index}`,
        description: ref.description,
        filePath: ref.filePath,
        line: ref.line,
        ordinal: index
      }));
      const resolvedRefs = resolveRefPaths(diagramRefs, refs.map(r => r.filePath));
      const bindings = buildBindingPlan(svgLabels, resolvedRefs);

      expect(bindings).toHaveLength(refs.length);
      bindings.forEach(binding => {
        expect(binding.matchedBy).toBe('text');
        expect(binding.ref.resolvedPath).toBe(binding.ref.filePath);
        // The bound element must actually be one of the rendered candidates
        // (i.e. a real hit-area gets attached, not an out-of-range index).
        expect(hitCandidates[binding.labelIndex]).toBeDefined();
      });
    });
  });
});

// Regression coverage for the ordinal-fallback misroute: when ref
// descriptions collide, buildBindingPlan can't disambiguate by text and
// falls back to binding index-by-index over the candidate list. Edge paths
// render before nodes in mermaid's DOM order and always carry an empty
// label, so if edges stayed in that candidate list, the very first ordinal
// binding lands on an arrow instead of a node — and every binding after it
// shifts by one, landing visible nodes on the WRONG ref (wrong target file).
// This was empirically reproduced against tests/unit/lib/fixtures/flowchart.svg:
// with two refs both described "Start", one bound to the arrow and the
// other bound to the "Start" node under a different ref's file.
describe('MermaidRenderer hit-area selector (duplicate-label ordinal fallback)', () => {
  // Same DOM shape as the flowchart fixture (g.edgePaths > path sibling to
  // g.nodes > g.node), but with two nodes sharing an identical label so
  // buildBindingPlan cannot use text matching and must fall back to ordinal.
  const DUPLICATE_LABEL_SVG = `
    <svg id="fixture-dup" xmlns="http://www.w3.org/2000/svg">
      <g class="root">
        <g class="edgePaths">
          <path id="L-A-B-0" class="edge-thickness-normal edge-pattern-solid flowchart-link" d="M0,0L10,10"></path>
        </g>
        <g class="nodes">
          <g class="node default flowchart-label" id="flowchart-A-0" data-id="A">
            <rect></rect>
            <g class="label"><foreignObject width="40" height="18"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">Start</span></div></foreignObject></g>
          </g>
          <g class="node default flowchart-label" id="flowchart-B-1" data-id="B">
            <rect></rect>
            <g class="label"><foreignObject width="40" height="18"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">Start</span></div></foreignObject></g>
          </g>
        </g>
      </g>
    </svg>
  `;

  function loadDuplicateLabelSvg(): SVGElement {
    const container = document.createElement('div');
    container.innerHTML = DUPLICATE_LABEL_SVG;
    const svgEl = container.querySelector('svg');
    if (!svgEl) throw new Error('inline duplicate-label fixture did not parse to an <svg> root');
    return svgEl;
  }

  const COLLIDING_REFS = [
    { description: 'Start', filePath: 'src/a.ts', line: 10 },
    { description: 'Start', filePath: 'src/b.ts', line: 20 }
  ];

  function toDiagramRefs(refs: typeof COLLIDING_REFS): DiagramRef[] {
    return refs.map((ref, index) => ({
      id: `id-${index}`,
      description: ref.description,
      filePath: ref.filePath,
      line: ref.line,
      ordinal: index
    }));
  }

  it('reproduces the bug with the raw selector: ordinal fallback lands on the edge path', () => {
    const svgEl = loadDuplicateLabelSvg();
    // Bypassing getHitCandidates on purpose, to demonstrate why it exists:
    // the raw selector puts the edge path first (mermaid DOM order).
    const hitCandidates = Array.from(svgEl.querySelectorAll(HIT_CANDIDATE_SELECTOR));
    const svgLabels = hitCandidates.map(extractLabelText);

    const resolvedRefs = resolveRefPaths(toDiagramRefs(COLLIDING_REFS), COLLIDING_REFS.map(r => r.filePath));
    const bindings = buildBindingPlan(svgLabels, resolvedRefs);

    expect(bindings).toHaveLength(2);
    bindings.forEach(b => expect(b.matchedBy).toBe('ordinal'));

    const firstBoundEl = hitCandidates[bindings[0].labelIndex];
    expect(firstBoundEl.tagName.toLowerCase()).toBe('path');
    expect(extractLabelText(firstBoundEl)).toBe('');
  });

  it('the fix: getHitCandidates excludes edges once nodes are present, so ordinal fallback only ever targets nodes', () => {
    const svgEl = loadDuplicateLabelSvg();
    const hitCandidates = getHitCandidates(svgEl);
    const svgLabels = hitCandidates.map(extractLabelText);

    const resolvedRefs = resolveRefPaths(toDiagramRefs(COLLIDING_REFS), COLLIDING_REFS.map(r => r.filePath));
    const bindings = buildBindingPlan(svgLabels, resolvedRefs);

    expect(bindings).toHaveLength(2);

    const nodeEls = new Set(Array.from(svgEl.querySelectorAll('g.nodes > g.node')));
    const edgeEls = new Set(Array.from(svgEl.querySelectorAll('g.edgePaths > path')));

    bindings.forEach(binding => {
      expect(binding.matchedBy).toBe('ordinal');
      expect(binding.ref.resolvedPath).toBe(binding.ref.filePath);

      const boundEl = hitCandidates[binding.labelIndex];
      // Never an edge path — this is the defect under test.
      expect(edgeEls.has(boundEl)).toBe(false);
      // Always a real rendered node.
      expect(nodeEls.has(boundEl)).toBe(true);
      // The node's own rendered text matches what the ref describes, so the
      // "wrong file" misroute (a visible node bound to an unrelated ref)
      // cannot happen even though both nodes share a label.
      expect(extractLabelText(boundEl)).toBe(binding.ref.description);
    });
  });
});
