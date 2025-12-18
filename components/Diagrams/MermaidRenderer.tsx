
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, ArrowLeftRight, HelpCircle, Info, AlertCircle } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import clsx from 'clsx';
import { CodeReference } from '../../types';

interface MermaidRendererProps {
  code: string;
  id: string;
  references?: CodeReference[];
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code = "", id = "", references = [] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { navigateToCode } = usePR();
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  useEffect(() => {
    (window as any).handleDiagramClick = (refId: string) => {
        const ref = references.find(r => r.id === refId);
        if (ref && ref.status === 'valid') {
            navigateToCode({ filepath: ref.filepath, line: ref.line, source: 'diagram', diagramId: id, referenceId: refId });
        }
    };

    try {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'monospace' });
    } catch (e) {
      console.warn("Mermaid init failed", e);
    }
  }, [references, navigateToCode, id]);

  const enhanceClickableAreas = useCallback((svgEl: SVGElement) => {
      const messagePaths = svgEl.querySelectorAll('.messageLine0, .messageLine1');
      messagePaths.forEach((path, idx) => {
          const ref = references[idx];
          if (!ref) return;
          const hitArea = path.cloneNode(true) as SVGElement;
          hitArea.setAttribute('stroke-width', '24');
          hitArea.setAttribute('stroke', 'transparent');
          hitArea.style.cursor = ref.status === 'valid' ? 'pointer' : 'not-allowed';
          hitArea.style.pointerEvents = 'stroke';
          if (ref.status === 'valid') hitArea.onclick = () => (window as any).handleDiagramClick(ref.id);
          path.parentNode?.insertBefore(hitArea, path);
      });
  }, [references]);

  useEffect(() => {
    if (!id || !code) return;
    
    let isMounted = true;
    const render = async () => {
      try {
        const sanitizedId = `mermaid-${id.toString().replace(/\W/g, '')}`;
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
        if (svgEl) enhanceClickableAreas(svgEl);
    }
  }, [svgContent, enhanceClickableAreas]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-950 overflow-hidden flex flex-col group">
      <style>{`.valid-ref { cursor: pointer; fill: #60a5fa !important; font-weight: bold; } .unresolved-ref { cursor: not-allowed; opacity: 0.5; }`}</style>
      <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setTransform(p => ({...p, k: p.k + 0.1}))} className="p-1.5 bg-gray-800 rounded border border-gray-700 hover:text-white"><ZoomIn size={18} /></button>
        <button onClick={() => setTransform(p => ({...p, k: Math.max(0.1, p.k - 0.1)}))} className="p-1.5 bg-gray-800 rounded border border-gray-700 hover:text-white"><ZoomOut size={18} /></button>
        <button onClick={() => setTransform({x: 0, y: 0, k: 1})} className="p-1.5 bg-gray-800 rounded border border-gray-700 hover:text-white"><RotateCcw size={18} /></button>
      </div>
      <div className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="text-red-500 mb-2" size={32} />
            <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          </div>
        ) : (
          <div 
            ref={contentRef} 
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }} 
            dangerouslySetInnerHTML={{ __html: svgContent }} 
          />
        )}
      </div>
    </div>
  );
};
