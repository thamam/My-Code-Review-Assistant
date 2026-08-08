import { useRef, useCallback } from 'react';
import { registerLine, unregisterLine } from '../../modules/navigation/lineRegistry';
import { coordAttr, type LineCoord } from './lineCoord';

/**
 * Returns a per-coord ref callback that stays referentially stable across
 * re-renders, so React doesn't detach/re-register a row's line-registry
 * entry every time the parent view re-renders (only on actual mount/unmount).
 */
export function useLineRefCallback(filePath: string) {
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const registered = useRef(new Map<string, HTMLElement | null>());
  const lastFilePath = useRef(filePath);

  if (lastFilePath.current !== filePath) {
    callbacks.current.clear();
    registered.current.clear();
    lastFilePath.current = filePath;
  }

  const getLineRef = useCallback((coord: LineCoord) => {
    const key = coordAttr(coord);
    let cb = callbacks.current.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) {
          registerLine(filePath, coord.line, el, coord.side);
          registered.current.set(key, el);
        } else {
          const prevEl = registered.current.get(key);
          if (prevEl) {
            unregisterLine(filePath, coord.line, prevEl, coord.side);
            registered.current.set(key, null);
          }
        }
      };
      callbacks.current.set(key, cb);
    }
    return cb;
  }, [filePath]);

  return getLineRef;
}
