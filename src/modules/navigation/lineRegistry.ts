/**
 * Line Registry — registration-based handshake between navigation and the
 * mounted code view, replacing polling/setTimeout-retry with a promise that
 * resolves the moment the target line element registers (or immediately if
 * it already has).
 *
 * Lines are addressed by (fileKey, side, lineNumber): deleted rows only
 * exist on the old side, so side is part of the identity, not just line.
 */

type LineSide = 'old' | 'new';

interface PendingWait {
  resolve: (el: HTMLElement | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

function coordKey(side: LineSide, lineNumber: number): string {
  return `${side}:${lineNumber}`;
}

class LineRegistry {
  private lines = new Map<string, Map<string, HTMLElement>>();
  private pending = new Map<string, Map<string, PendingWait[]>>();

  registerLine(fileKey: string, lineNumber: number, el: HTMLElement, side: LineSide = 'new'): void {
    let fileLines = this.lines.get(fileKey);
    if (!fileLines) {
      fileLines = new Map();
      this.lines.set(fileKey, fileLines);
    }
    const key = coordKey(side, lineNumber);
    fileLines.set(key, el);

    const filePending = this.pending.get(fileKey);
    const waiters = filePending?.get(key);
    if (waiters && waiters.length > 0) {
      filePending!.delete(key);
      if (filePending!.size === 0) this.pending.delete(fileKey);
      waiters.forEach(w => {
        clearTimeout(w.timer);
        w.resolve(el);
      });
    }
  }

  unregisterLine(fileKey: string, lineNumber: number, el: HTMLElement, side: LineSide = 'new'): void {
    const fileLines = this.lines.get(fileKey);
    const key = coordKey(side, lineNumber);
    if (!fileLines || fileLines.get(key) !== el) return;
    fileLines.delete(key);
    if (fileLines.size === 0) this.lines.delete(fileKey);
  }

  waitForLine(fileKey: string, lineNumber: number, timeoutMs: number, side: LineSide = 'new'): Promise<HTMLElement | null> {
    const key = coordKey(side, lineNumber);
    const existing = this.lines.get(fileKey)?.get(key);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
      let fileWaiters = this.pending.get(fileKey);
      if (!fileWaiters) {
        fileWaiters = new Map();
        this.pending.set(fileKey, fileWaiters);
      }
      let waiters = fileWaiters.get(key);
      if (!waiters) {
        waiters = [];
        fileWaiters.set(key, waiters);
      }

      const entry: PendingWait = {
        resolve,
        timer: setTimeout(() => {
          const filePending = this.pending.get(fileKey);
          const list = filePending?.get(key);
          if (list) {
            const idx = list.indexOf(entry);
            if (idx !== -1) list.splice(idx, 1);
            if (list.length === 0) {
              filePending!.delete(key);
              if (filePending!.size === 0) this.pending.delete(fileKey);
            }
          }
          resolve(null);
        }, timeoutMs),
      };
      waiters.push(entry);
    });
  }

  /** Nearest already-registered line number on the same file/side, or null if none are registered. */
  findNearestLine(fileKey: string, side: LineSide, lineNumber: number): number | null {
    const fileLines = this.lines.get(fileKey);
    if (!fileLines || fileLines.size === 0) return null;

    let nearest: number | null = null;
    let nearestDist = Infinity;
    for (const key of fileLines.keys()) {
      const sepIdx = key.indexOf(':');
      if (key.slice(0, sepIdx) !== side) continue;
      const candidate = parseInt(key.slice(sepIdx + 1), 10);
      const dist = Math.abs(candidate - lineNumber);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }
    return nearest;
  }
}

export const lineRegistry = new LineRegistry();
export const registerLine = lineRegistry.registerLine.bind(lineRegistry);
export const unregisterLine = lineRegistry.unregisterLine.bind(lineRegistry);
export const waitForLine = lineRegistry.waitForLine.bind(lineRegistry);
export const findNearestLine = lineRegistry.findNearestLine.bind(lineRegistry);
