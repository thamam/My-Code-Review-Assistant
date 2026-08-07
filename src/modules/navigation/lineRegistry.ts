/**
 * Line Registry — registration-based handshake between navigation and the
 * mounted code view, replacing polling/setTimeout-retry with a promise that
 * resolves the moment the target line element registers (or immediately if
 * it already has).
 */

interface PendingWait {
  resolve: (el: HTMLElement | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

class LineRegistry {
  private lines = new Map<string, Map<number, HTMLElement>>();
  private pending = new Map<string, Map<number, PendingWait[]>>();

  registerLine(fileKey: string, lineNumber: number, el: HTMLElement): void {
    let fileLines = this.lines.get(fileKey);
    if (!fileLines) {
      fileLines = new Map();
      this.lines.set(fileKey, fileLines);
    }
    fileLines.set(lineNumber, el);

    const waiters = this.pending.get(fileKey)?.get(lineNumber);
    if (waiters && waiters.length > 0) {
      this.pending.get(fileKey)!.delete(lineNumber);
      waiters.forEach(w => {
        clearTimeout(w.timer);
        w.resolve(el);
      });
    }
  }

  unregisterLine(fileKey: string, lineNumber: number, el: HTMLElement): void {
    const fileLines = this.lines.get(fileKey);
    if (!fileLines || fileLines.get(lineNumber) !== el) return;
    fileLines.delete(lineNumber);
    if (fileLines.size === 0) this.lines.delete(fileKey);
  }

  waitForLine(fileKey: string, lineNumber: number, timeoutMs: number): Promise<HTMLElement | null> {
    const existing = this.lines.get(fileKey)?.get(lineNumber);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
      let fileWaiters = this.pending.get(fileKey);
      if (!fileWaiters) {
        fileWaiters = new Map();
        this.pending.set(fileKey, fileWaiters);
      }
      let waiters = fileWaiters.get(lineNumber);
      if (!waiters) {
        waiters = [];
        fileWaiters.set(lineNumber, waiters);
      }

      const entry: PendingWait = {
        resolve,
        timer: setTimeout(() => {
          const list = this.pending.get(fileKey)?.get(lineNumber);
          if (list) {
            const idx = list.indexOf(entry);
            if (idx !== -1) list.splice(idx, 1);
            if (list.length === 0) this.pending.get(fileKey)?.delete(lineNumber);
          }
          resolve(null);
        }, timeoutMs),
      };
      waiters.push(entry);
    });
  }
}

export const lineRegistry = new LineRegistry();
export const registerLine = lineRegistry.registerLine.bind(lineRegistry);
export const unregisterLine = lineRegistry.unregisterLine.bind(lineRegistry);
export const waitForLine = lineRegistry.waitForLine.bind(lineRegistry);
