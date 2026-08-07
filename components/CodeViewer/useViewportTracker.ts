import { useRef, useCallback, useEffect } from 'react';

/**
 * Shared viewport tracking hook for DiffView and SourceView.
 *
 * Tracks which line numbers are visible via IntersectionObserver callbacks,
 * debounces updates to 100ms, and calls onViewportChange with the min/max
 * visible line range.
 *
 * The returned handleLineVisibility is stable (useCallback with empty deps)
 * so LineMarker's IntersectionObserver is never unnecessarily re-registered.
 */
export function useViewportTracker(
  filePath: string,
  onViewportChange?: (file: string, startLine: number, endLine: number) => void
) {
  const visibleLines = useRef(new Set<number>());
  const updateTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filePathRef = useRef(filePath);
  const onViewportChangeRef = useRef(onViewportChange);

  // Keep refs current without invalidating the stable callback below
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);

  // Cleanup on unmount — prevents stale onViewportChange firing after file switch
  useEffect(() => {
    return () => { clearTimeout(updateTimeout.current); };
  }, []);

  const handleLineVisibility = useCallback((lineNumber: number, isVisible: boolean) => {
    if (isVisible) visibleLines.current.add(lineNumber);
    else visibleLines.current.delete(lineNumber);

    clearTimeout(updateTimeout.current);
    updateTimeout.current = setTimeout(() => {
      if (visibleLines.current.size === 0 || !onViewportChangeRef.current) return;
      const sorted = Array.from(visibleLines.current).sort((a, b) => a - b);
      onViewportChangeRef.current(filePathRef.current, sorted[0], sorted[sorted.length - 1]);
    }, 100);
  }, []); // stable — never recreated

  return { handleLineVisibility };
}
