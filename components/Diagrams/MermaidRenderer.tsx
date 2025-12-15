import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Move, ArrowLeftRight, MousePointer2 } from 'lucide-react';
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
      
      // 1. Determine Natural Size from ViewBox
      let naturalWidth = 0;
      let naturalHeight = 0;

      if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
          naturalWidth = svgEl.viewBox.baseVal.width;
          naturalHeight = svgEl.viewBox.baseVal.height;
      } else {
          // Fallback if no viewBox (unlikely with mermaid)
          const bbox = svgEl.getBoundingClientRect();
          naturalWidth = bbox.width || 1000;
          naturalHeight = bbox.height || 1000;
      }

      // 2. CRITICAL: Force wrapper to match natural size so scale() operates on true 1:1 pixels
      contentRef.current.style.width = `${naturalWidth}px`;
      contentRef.current.style.height = `${naturalHeight}px`;

      // 3. Ensure SVG fills the wrapper without constraints
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.maxWidth = 'none';
      svgEl.removeAttribute('height'); // Remove fixed height attributes

      // 4. Calculate Scale
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      if (containerWidth === 0) return; // Layout not ready

      const padding = 40;
      const availableWidth = Math.max(0, containerWidth - padding);
      
      // If the diagram is wider than container, shrink it. 
      // If container is wider, you might want to limit scale to 1 (optional), but "Fit Width" usually implies filling width.
      // Let's allow upscale up to 1.5x to ensure readability on wide screens for small diagrams.
      const scale = availableWidth / naturalWidth;
      
      // Center vertically based on the new scale
      const scaledHeight = naturalHeight * scale;
      const yOffset = Math.max(0, (containerHeight - scaledHeight) / 2);
      
      setTransform({
          x: padding / 2,
          y: yOffset,
          k: scale
      });
      
      // Reset manual flag because we just auto-fitted
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
            setTransform({ x: 0, y: 0, k: 1 }); // Reset transform temporarily
            setIsManuallyZoomed(false); // Reset manual state
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

  // Post-Render Cleanup & Initial Fit
  useEffect(() => {
     if (svgContent) {
         // Use RAF to ensure DOM update is painted
         requestAnimationFrame(() => {
             handleFitWidth();
         });
     }
  }, [svgContent, handleFitWidth]);

  // Resize Observer to handle Split View animations or Window Resizes
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


  // --- Actions ---

  const handleZoom = (delta: number) => {
      setIsManuallyZoomed(true);
      setTransform(prev => ({
          ...prev,
          k: Math.max(0.1, prev.k + delta) // Allow zooming out to 0.1x
      }));
  };

  const handleManualFit = () => {
      handleFitWidth();
      // handleFitWidth sets isManuallyZoomed to false internally
  };

  const handleReset = () => {
      setIsManuallyZoomed(true); // User explicitly requested 1:1, stop auto-fitting
      setTransform({ x: 0, y: 0, k: 1 });
  };

  // --- Mouse Interactions (Pan) ---

  const handleMouseDown = (e: React.MouseEvent) => {
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

  // --- Keyboard Interactions (Joystick) ---

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
    >
      {/* Background Grid Pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10 transition-opacity duration-300" 
        style={{ 
            backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', 
            backgroundSize: '20px 20px',
            transform: `translate(${transform.x % 20}px, ${transform.y % 20}px)` 
        }} 
      />

      {/* Toolbar */}
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
             Drag to Pan • Arrow Keys
          </div>
      </div>

      {/* Canvas Area */}
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
                    // Use standard CSS transform instead of transition for smoother drag performance
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }} 
            />
        )}
      </div>
    </div>
  );
};