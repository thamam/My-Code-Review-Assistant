
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, AlertCircle } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { CodeReference } from '../../types';

interface MermaidRendererProps {
  code: string;
  id: string;
  references?: CodeReference[];
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code = "", id = "", references = [] }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const { navigateToCode } = usePR();
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Reset transform when diagram changes
  useEffect(() => {
    setTransform({ x: 0, y: 0, k: 1 });
  }, [id]);

  // Use a ref for the latest navigateToCode to avoid stale closure issues in the global callback
  const navigateRef = useRef(navigateToCode);
  useEffect(() => { navigateRef.current = navigateToCode; }, [navigateToCode]);

  useEffect(() => {
    // Expose a diagram-specific global click handler
    const globalHandlerName = `handleDiagramClick_${id.replace(/\W/g, '_')}`;
    (window as any)[globalHandlerName] = (refId: string) => {
        const ref = references?.find(r => r.id === refId);
        if (ref && ref.status === 'valid') {
            navigateRef.current({ 
                filepath: ref.filepath, 
                line: ref.line, 
                source: 'diagram', 
                diagramId: id, 
                referenceId: refId 
            });
        }
    };

    // Keep the general handler for legacy/generic calls
    (window as any).handleDiagramClick = (refId: string) => {
        const ref = references?.find(r => r.id === refId);
        if (ref && ref.status === 'valid') {
            navigateRef.current({ filepath: ref.filepath, line: ref.line, source: 'diagram' });
        }
    };

    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'dark', 
      securityLevel: 'loose', 
      fontFamily: 'monospace',
      sequence: {
        useMaxWidth: false,
        height: 65,
        actorMargin: 50,
        messageMargin: 40,
        mirrorActors: false,
        boxMargin: 10
      }
    });

    return () => {
        delete (window as any)[globalHandlerName];
    };
  }, [references, id]);

  const enhanceClickableAreas = useCallback((svgEl: SVGElement) => {
      if (!references || references.length === 0) return;

      const globalHandlerName = `handleDiagramClick_${id.replace(/\W/g, '_')}`;

      // Find all text elements in the SVG
      const textElements = svgEl.querySelectorAll('text, tspan');
      textElements.forEach(el => {
          const content = el.textContent?.trim();
          if (!content) return;

          const ref = references.find(r => r.description === content);
          if (ref && ref.status === 'valid') {
              const target = (el instanceof SVGTSpanElement ? el.parentElement : el) as HTMLElement;
              if (target) {
                target.style.cursor = 'pointer';
                target.style.textDecoration = 'underline';
                target.style.fill = '#60a5fa'; // Blue-400
                target.onclick = (e) => {
                    e.stopPropagation();
                    const handler = (window as any)[globalHandlerName];
                    if (handler) handler(ref.id);
                };
              }
          }
      });

      // Enhance actors
      const actors = svgEl.querySelectorAll('.actor, .actor-man');
      actors.forEach(actor => {
          const label = actor.parentElement?.querySelector('text')?.textContent?.trim();
          const ref = references.find(r => r.description === label);
          if (ref && ref.status === 'valid') {
              (actor as HTMLElement).style.cursor = 'pointer';
              (actor as HTMLElement).onclick = () => {
                const handler = (window as any)[globalHandlerName];
                if (handler) handler(ref.id);
              };
          }
      });
  }, [references, id]);

  useEffect(() => {
    if (!id || !code) return;
    
    let isMounted = true;
    const render = async () => {
      try {
        const sanitizedId = `mermaid-${id.replace(/\W/g, '')}-${Date.now()}`;
        const { svg } = await mermaid.render(sanitizedId, code);
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Mermaid Render Error");
      }
    };
    render();
    return () => { isMounted = false; };
  }, [code, id]);

  useEffect(() => {
    if (svgContent && contentRef.current) {
        const svgEl = contentRef.current.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', '100%');
            svgEl.setAttribute('height', 'auto');
            svgEl.style.maxWidth = 'none';
            svgEl.style.overflow = 'visible';
            enhanceClickableAreas(svgEl);
        }
    }
  }, [svgContent, enhanceClickableAreas]);

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden flex flex-col group">
      <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setTransform(p => ({...p, k: p.k + 0.15}))} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><ZoomIn size={18} /></button>
        <button onClick={() => setTransform(p => ({...p, k: Math.max(0.1, p.k - 0.15)}))} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><ZoomOut size={18} /></button>
        <button onClick={() => setTransform({x: 0, y: 0, k: 1})} className="p-1.5 bg-gray-800/90 rounded border border-gray-700 hover:text-white transition-colors shadow-lg"><RotateCcw size={18} /></button>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar p-12">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-gray-900 rounded-lg border border-gray-800">
            <AlertCircle className="text-red-500 mb-2" size={32} />
            <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          </div>
        ) : (
          <div 
            ref={contentRef} 
            className="flex items-center justify-center transition-transform duration-200 ease-out"
            style={{ 
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, 
                transformOrigin: 'top center' 
            }} 
            dangerouslySetInnerHTML={{ __html: svgContent }} 
          />
        )}
      </div>
    </div>
  );
};
