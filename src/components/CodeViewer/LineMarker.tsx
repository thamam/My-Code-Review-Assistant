import React, { useEffect, useRef } from 'react';

interface LineMarkerProps {
  lineId: string;
  lineNumber: number;
  onVisible: (lineNumber: number, isVisible: boolean) => void;
}

export const LineMarker: React.FC<LineMarkerProps> = ({ lineId, lineNumber, onVisible }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          onVisible(lineNumber, entry.isIntersecting);
        });
      },
      { rootMargin: '0px', threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [lineNumber, onVisible]);

  return (
    <div 
      ref={ref} 
      data-line-id={lineId} 
      className="absolute left-0 w-1 h-full opacity-0 pointer-events-none" 
      aria-hidden="true" 
    />
  );
};
