import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { CodeReference } from '../../types';
import { buildBindingPlan, resolveRefPaths, DiagramRef } from '../../src/lib/diagramRefs';

interface MermaidRendererProps {
  code: string;
  id: string;
  references?: CodeReference[];
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
    if (!references || references.length === 0) return;

    // Mermaid renders sequence messages as .messageLine0, .messageLine1, etc.
    // Flowcharts use .edgePath .path
    const messagePaths = Array.from(svgEl.querySelectorAll('[class^="messageLine"], .edgePath .path'));

    // Bind by the rendered label text (falling back to position only when
    // counts line up) instead of trusting DOM order, which Mermaid can
    // reorder or drop elements from.
    const svgLabels = messagePaths.map(path => {
      const group = path.closest('g') ?? path.parentElement;
      return group?.querySelector('text')?.textContent ?? '';
    });

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
      if (!ref.resolvedPath) return; // File no longer resolvable — skip rather than misroute.

      const path = messagePaths[labelIndex];

      // Clone the path to create a wide, invisible hit area
      const hitArea = path.cloneNode(true) as SVGElement;
      hitArea.setAttribute('stroke-width', '20'); // Wide hit area
      hitArea.setAttribute('stroke', 'transparent');
      hitArea.setAttribute('fill', 'none');
      hitArea.style.cursor = 'pointer';
      hitArea.style.pointerEvents = 'stroke'; // Only capture clicks on the stroke
      hitArea.classList.add('clickable-ref');

      // Insert after the visible path so it is on top and captures clicks reliably
      path.parentNode?.insertBefore(hitArea, path.nextSibling);

      // Attach React Handler (No window globals!)
      hitArea.onclick = (e) => {
        e.stopPropagation();
        navigateToCode({
          filepath: ref.filePath,
          line: ref.line,
          source: 'diagram',
          diagramId: id,
          referenceId: ref.id
        });
      };

      // Visual Feedback on Hover (Optional: manipulate the visible path)
      hitArea.onmouseenter = () => {
        (path as SVGElement).style.stroke = '#60a5fa'; // Blue highlight
        (path as SVGElement).style.strokeWidth = '3px';
      };
      hitArea.onmouseleave = () => {
        (path as SVGElement).style.stroke = ''; // Reset
        (path as SVGElement).style.strokeWidth = '';
      };
    });

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
