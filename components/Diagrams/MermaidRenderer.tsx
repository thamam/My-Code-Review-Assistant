import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Move, ArrowLeftRight, MousePointer2 } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import clsx from 'clsx';

interface MermaidRendererProps {
  code: string;
  id: string;
}

interface Transform {
  x: number;
  y: number;
  k: number; // scale
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code, id }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { scrollToLine } = usePR();
  
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Canvas State
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [isManuallyZoomed, setIsManuallyZoomed] = useState(false);
  const lastMouseRef = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    try {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            fontFamily: 'Menlo, Monaco, monospace',
            logLevel: 'error', 
        });
    } catch (e) {
        console.error("Mermaid initialization failed", e);
    }
  }, []);

  // Fit Width Logic
  const handleFitWidth = useCallback(() => {
      if (!containerRef.current || !contentRef.current) return;
      const svgEl = contentRef.current.querySelector('svg');
      if (!svgEl) return;
      
      let naturalWidth = 0;
      let naturalHeight = 0;

      if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
          naturalWidth = svgEl.viewBox.baseVal.width;
          naturalHeight = svgEl.viewBox.baseVal.height;
      } else {
          const bbox = svgEl.getBoundingClientRect();
          naturalWidth = bbox.width || 1000;
          naturalHeight = bbox.height || 1000;
      }

      contentRef.current.style.width = `${naturalWidth}px`;
      contentRef.current.style.height = `${naturalHeight}px`;

      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.maxWidth = 'none';
      svgEl.removeAttribute('height');

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      if (containerWidth === 0) return;

      const padding = 40;
      const availableWidth = Math.max(0, containerWidth - padding);
      const scale = availableWidth / naturalWidth;
      
      const scaledHeight = naturalHeight * scale;
      const yOffset = Math.max(0, (containerHeight - scaledHeight) / 2);
      
      setTransform({
          x: padding / 2,
          y: yOffset,
          k: scale
      });
      
      setIsManuallyZoomed(false);
  }, []);

  // Rendering Logic
  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      setError(null);
      try {
        const uniqueId = `mermaid-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;
        const { svg } = await mermaid.render(uniqueId, code);
        
        if (isMounted) {
            setSvgContent(svg);
            setTransform({ x: 0, y: 0, k: 1 });
            setIsManuallyZoomed(false);
        }
      } catch (err: any) {
        console.error("[Mermaid] Render Error:", err);
        if (isMounted) {
            setError(err.message || "Failed to render diagram. Syntax might be invalid.");
        }
      }
    };

    const timer = setTimeout(renderDiagram, 50);
    return () => {
        isMounted = false;
        clearTimeout(timer);
    };
  }, [code, id]);

  useEffect(() => {
     if (svgContent) {
         requestAnimationFrame(() => {
             handleFitWidth();
         });
     }
  }, [svgContent, handleFitWidth]);

  useEffect(() => {
      if (!containerRef.current) return;
      
      const observer = new ResizeObserver(() => {
          if (!isManuallyZoomed) {
              requestAnimationFrame(handleFitWidth);
          }
      });
      
      observer.observe(containerRef.current);
      return () => observer.disconnect();
  }, [handleFitWidth, isManuallyZoomed]);


  // --- Code Navigation Logic ---

  const handleSvgClick = (e: React.MouseEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      if (!(e.metaKey || e.ctrlKey)) return;

      // Use unknown cast to avoid potential overlapping type errors between EventTarget and SVGElement
      const target = e.target as unknown as SVGElement;
      let textNode: SVGTextElement | null = null;

      // Find the nearest text element
      if (target.tagName === 'text') {
          // Use unknown cast to avoid overlapping type error
          textNode = target as unknown as SVGTextElement;
      } else if (target.parentElement?.tagName === 'text') {
          // Use unknown cast to avoid overlapping type error from HTMLElement to SVGTextElement
          textNode = target.parentElement as unknown as SVGTextElement;
      }

      if (textNode) {
          const content = textNode.textContent || '';
          // Regex to find (filename:line)
          const match = content.match(/\(([^:]+):(\d+)\)/);
          
          if (match) {
              const file = match[1];
              const line = parseInt(match[2], 10);
              if (file && !isNaN(line)) {
                  e.preventDefault();
                  e.stopPropagation();
                  scrollToLine(file, line);
              }
          }
      }
  };

  // --- UI Actions ---

  const handleZoom = (delta: number) => {
      setIsManuallyZoomed(true);
      setTransform(prev => ({
          ...prev,
          k: Math.max(0.1, prev.k + delta)
      }));
  };

  const handleManualFit = () => {
      handleFitWidth();
  };

  const handleReset = () => {
      setIsManuallyZoomed(true);
      setTransform({ x: 0, y: 0, k: 1 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      // Don't start drag if holding meta/ctrl (user is likely trying to click a link)
      if (e.metaKey || e.ctrlKey) return;
      
      e.preventDefault();
      setIsDragging(true);
      setIsManuallyZoomed(true);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || !lastMouseRef.current) return;
      
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      
      setTransform(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
      }));
  };

  const handleMouseUp = () => {
      setIsDragging(false);
      lastMouseRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      const PAN_STEP = 50;
      setIsManuallyZoomed(true);
      switch (e.key) {
          case 'ArrowUp':
              setTransform(prev => ({ ...prev, y: prev.y + PAN_STEP }));
              break;
          case 'ArrowDown':
              setTransform(prev => ({ ...prev, y: prev.y - PAN_STEP }));
              break;
          case 'ArrowLeft':
              setTransform(prev => ({ ...prev, x: prev.x + PAN_STEP }));
              break;
          case 'ArrowRight':
              setTransform(prev => ({ ...prev, x: prev.x - PAN_STEP }));
              break;
          case '+':
          case '=':
              handleZoom(0.2);
              break;
          case '-':
          case '_':
              handleZoom(-0.2);
              break;
      }
  };

  return (
    <div 
        ref={containerRef} 
        className="relative w-full h-full bg-gray-900 overflow-hidden flex flex-col outline-none group"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleSvgClick}
    >
      <div 
        className="absolute inset-0 pointer-events-none opacity-10 transition-opacity duration-300" 
        style={{ 
            backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', 
            backgroundSize: '20px 20px',
            transform: `translate(${transform.x % 20}px, ${transform.y % 20}px)` 
        }} 
      />

      <div 
        className="absolute top-4 right-4 z-10 flex flex-col gap-2 transition-opacity duration-200 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        onMouseDown={e => e.stopPropagation()} 
      >
          <div className="flex gap-1 bg-gray-800/90 p-1.5 rounded-lg backdrop-blur-md border border-gray-700 shadow-xl">
            <button onClick={handleManualFit} className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Fit to Width">
                <ArrowLeftRight size={18} />
            </button>
            <div className="w-px bg-gray-700 mx-1 my-1" />
            <button onClick={() => handleZoom(-0.2)} className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Zoom Out (-)">
                <ZoomOut size={18} />
            </button>
            <span className="text-[10px] font-mono text-gray-400 flex items-center w-8 justify-center select-none">
                {Math.round(transform.k * 100)}%
            </span>
            <button onClick={() => handleZoom(0.2)} className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Zoom In (+)">
                <ZoomIn size={18} />
            </button>
            <div className="w-px bg-gray-700 mx-1 my-1" />
            <button onClick={handleReset} className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Reset to 100%">
                <RotateCcw size={18} />
            </button>
          </div>
          
          <div className="bg-gray-800/80 px-2 py-1 rounded text-[10px] text-gray-500 text-center backdrop-blur-sm border border-gray-700/50 select-none">
             Cmd+Click text to view code • Drag to Pan
          </div>
      </div>

      <div className={clsx(
          "flex-1 w-full h-full cursor-grab active:cursor-grabbing",
          isDragging && "cursor-grabbing"
      )}>
        {error ? (
            <div className="flex flex-col gap-4 max-w-lg w-full mx-auto mt-20 p-8" onMouseDown={e => e.stopPropagation()}>
                <div className="text-red-300 p-4 border border-red-800/50 rounded bg-red-900/20 flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-sm mb-1">Render Failed</h4>
                        <p className="text-xs opacity-90">{error}</p>
                    </div>
                </div>
                
                <div className="bg-gray-950 border border-gray-800 rounded p-3">
                    <div className="text-xs text-gray-500 mb-2 font-bold uppercase tracking-wider">Raw Mermaid Code</div>
                    <pre className="text-[10px] text-gray-400 font-mono overflow-auto whitespace-pre-wrap select-all">
                        {code}
                    </pre>
                </div>
            </div>
        ) : (
            <div 
                ref={contentRef}
                className="origin-top-left will-change-transform"
                style={{ 
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }} 
            />
        )}
      </div>
    </div>
  );
};
