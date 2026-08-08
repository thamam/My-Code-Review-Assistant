import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { CodeReference } from '../../types/domain';
import { buildBindingPlan, resolveRefPaths, DiagramRef } from '../../lib/diagramRefs';

interface MermaidRendererProps {
  code: string;
  id: string;
  references?: CodeReference[];
}

// Mermaid renders sequence messages as .messageLine0, .messageLine1, etc.
// (unchanged since v8). Flowchart/class/state diagrams route through
// mermaid's dagre-wrapper, which in v10 emits `g.edgePaths > path` for edges
// (not the v8 `.edgePath .path`) — and since diagramAgent.ts places
// §file:line refs on NODE labels for those three diagram types, not on
// edges, `g.nodes > g.node` must be included too or those refs have no
// hit-area to bind to at all.
// Exported for tests/unit/components/Diagrams/MermaidRenderer.hitAreas.test.ts.
export const HIT_CANDIDATE_SELECTOR = '[class^="messageLine"], g.edgePaths > path, g.nodes > g.node';

// Extracts the rendered label text for a hit-area candidate (a `<g class="node">`
// group or an edge `<path>`/`<line>`). Mermaid v10 renders node labels as HTML
// inside a foreignObject (span.nodeLabel), not a native SVG <text> node. Class
// diagram titles are additionally wrapped in a .classTitle container — checked
// first because a class node with attributes/methods carries one extra
// .nodeLabel span per member row, which would otherwise make the "exactly one
// .nodeLabel" check below ambiguous.
// Exported for tests/unit/components/Diagrams/MermaidRenderer.hitAreas.test.ts.
export function extractLabelText(el: Element): string {
  const group = el.closest('g') ?? el.parentElement;
  if (!group) return '';

  const titleLabel = group.querySelector('.classTitle .nodeLabel');
  if (titleLabel) return titleLabel.textContent?.trim() ?? '';

  const htmlLabels = Array.from(group.querySelectorAll('.nodeLabel'))
    .map(node => node.textContent?.trim() ?? '')
    .filter(Boolean);
  if (htmlLabels.length === 1) return htmlLabels[0];

  const texts = group.querySelectorAll('text');
  return texts.length === 1 ? (texts[0].textContent ?? '') : '';
}

// Selects the ordered candidate list that buildBindingPlan's ordinal fallback
// binds against. Prefers nodes over edges when any nodes are present:
// diagramAgent.ts only ever places §refs on NODE labels for flowchart/class/
// state, and edge paths render before nodes in mermaid's DOM order while
// carrying no label text — if edges stayed in the candidate list, the
// ordinal fallback would land on an edge (empty label) for any ref whose
// description isn't uniquely identifying, silently misrouting navigation to
// the wrong file. Sequence diagrams have no `g.nodes > g.node` elements, so
// they fall through to the full selector unchanged (messageLine only).
// Exported for tests/unit/components/Diagrams/MermaidRenderer.hitAreas.test.ts.
export function getHitCandidates(svgEl: SVGElement | Element): Element[] {
  const nodeEls = Array.from(svgEl.querySelectorAll('g.nodes > g.node'));
  return nodeEls.length
    ? [...Array.from(svgEl.querySelectorAll('[class^="messageLine"]')), ...nodeEls]
    : Array.from(svgEl.querySelectorAll(HIT_CANDIDATE_SELECTOR));
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code = "", id = "", references = [] }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const { navigateToCode, prData } = usePR();
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // 1. Initialize Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose', // Required for clicks
      fontFamily: 'monospace',
      sequence: { useMaxWidth: false, height: 65, actorMargin: 50, messageMargin: 40, boxMargin: 10 }
    });
  }, []);

  // 2. Render Diagram
  useEffect(() => {
    if (!id || !code) return;
    let isMounted = true;
    const render = async () => {
      try {
        console.log(`[MermaidRenderer] Rendering diagram ${id} with code:`, code.substring(0, 50) + '...');
        const sanitizedId = `mermaid-${id.replace(/\W/g, '')}-${Date.now()}`;
        const { svg } = await mermaid.render(sanitizedId, code);
        console.log(`[MermaidRenderer] Render successful for ${id}, SVG length: ${svg.length}`);
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err: any) {
        console.error(`[MermaidRenderer] Render FAILED for ${id}:`, err);
        if (isMounted) setError(err.message || "Mermaid Render Error");
      }
    };
    render();
    return () => { isMounted = false; };
  }, [code, id]);

  // 3. Enhance SVG with Hit Areas (Spec §3.6)
  const enhanceClickableAreas = useCallback((svgEl: SVGElement) => {
    // Idempotence guard: the effect below re-runs whenever this callback's
    // identity changes (references/id/navigateToCode/prData), which can
    // happen while the same rendered SVG is still mounted — without this,
    // every re-run would clone another layer of hit-areas on top.
    if (svgEl.hasAttribute('data-theia-enhanced')) return;
    if (!references || references.length === 0) return;

    const hitCandidates = getHitCandidates(svgEl);

    // Bind by the rendered label text (falling back to position only when
    // counts line up) instead of trusting DOM order, which Mermaid can
    // reorder or drop elements from.
    const svgLabels = hitCandidates.map(extractLabelText);

    const diagramRefs: DiagramRef[] = references.map((ref, index) => ({
      id: ref.id,
      description: ref.description,
      filePath: ref.filepath,
      line: ref.line,
      ordinal: index
    }));
    const currentPaths = prData?.files.map(f => f.path) ?? [];
    const resolvedRefs = resolveRefPaths(diagramRefs, currentPaths);
    const bindings = buildBindingPlan(svgLabels, resolvedRefs);

    if (bindings.length < resolvedRefs.length) {
      console.warn(`[MermaidRenderer] ${resolvedRefs.length - bindings.length} reference(s) for diagram ${id} could not be matched to a rendered element and were skipped`);
    }

    bindings.forEach(({ ref, labelIndex }) => {
      const resolvedPath = ref.resolvedPath;
      if (!resolvedPath) return; // File no longer resolvable — skip rather than misroute.

      const el = hitCandidates[labelIndex] as SVGElement;

      // Attach React Handler (No window globals!)
      const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        navigateToCode({
          filepath: resolvedPath,
          line: ref.line,
          source: 'diagram',
          diagramId: id,
          referenceId: ref.id
        });
      };

      if (el.tagName.toLowerCase() === 'g') {
        // Node hit area: the group is already a solid shape (rect/polygon),
        // so unlike a thin edge path it needs no cloned/expanded hit area —
        // just pointer-events enabled and handlers on the group itself.
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'all';
        el.classList.add('clickable-ref');

        const shape = el.querySelector('rect, polygon, circle, ellipse') as SVGElement | null;
        el.onclick = handleClick;
        el.onmouseenter = () => {
          if (shape) {
            shape.style.stroke = '#60a5fa'; // Blue highlight
            shape.style.strokeWidth = '3px';
          }
        };
        el.onmouseleave = () => {
          if (shape) {
            shape.style.stroke = ''; // Reset
            shape.style.strokeWidth = '';
          }
        };
        return;
      }

      // Edge hit area: clone the path to create a wide, invisible hit area
      const hitArea = el.cloneNode(true) as SVGElement;
      hitArea.setAttribute('stroke-width', '20'); // Wide hit area
      hitArea.setAttribute('stroke', 'transparent');
      hitArea.setAttribute('fill', 'none');
      hitArea.style.cursor = 'pointer';
      hitArea.style.pointerEvents = 'stroke'; // Only capture clicks on the stroke
      hitArea.classList.add('clickable-ref');

      // Insert after the visible path so it is on top and captures clicks reliably
      el.parentNode?.insertBefore(hitArea, el.nextSibling);

      hitArea.onclick = handleClick;

      // Visual Feedback on Hover (Optional: manipulate the visible path)
      hitArea.onmouseenter = () => {
        el.style.stroke = '#60a5fa'; // Blue highlight
        el.style.strokeWidth = '3px';
      };
      hitArea.onmouseleave = () => {
        el.style.stroke = ''; // Reset
        el.style.strokeWidth = '';
      };
    });

    svgEl.setAttribute('data-theia-enhanced', 'true');
  }, [references, id, navigateToCode, prData]);

  // 4. Apply Enhancement after Render
  useEffect(() => {
    if (svgContent && contentRef.current) {
      const svgEl = contentRef.current.querySelector('svg');
      if (svgEl) {
        svgEl.setAttribute('width', '100%');
        // Remove invalid height="auto" - let aspect ratio handle it
        svgEl.removeAttribute('height'); 
        svgEl.style.maxWidth = 'none';
        // Trigger the enhancement
        enhanceClickableAreas(svgEl);
      }
    }
  }, [svgContent, enhanceClickableAreas]);

  // ... (Keep render return with Zoom controls)
  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden flex flex-col group">
      {/* Zoom Controls (Keep existing) */}
      <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setTransform(p => ({ ...p, k: p.k + 0.15 }))} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><ZoomIn size={18} /></button>
        <button onClick={() => setTransform(p => ({ ...p, k: Math.max(0.1, p.k - 0.15) }))} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><ZoomOut size={18} /></button>
        <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><RotateCcw size={18} /></button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-12">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-xs">{error}</div>
        ) : (
          <div
            ref={contentRef}
            className="transition-transform duration-200 ease-out origin-top"
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
            data-testid="mermaid-diagram"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
};
