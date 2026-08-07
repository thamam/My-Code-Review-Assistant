import { describe, it, expect, beforeEach } from 'vitest';
import { lineRegistry } from '../../../src/modules/navigation/lineRegistry';

function fakeEl(): HTMLElement {
  return {} as HTMLElement;
}

describe('lineRegistry', () => {
  beforeEach(() => {
    // Fresh registry per test — the module exports a singleton, so drain it
    // by unregistering anything a prior test left behind is impractical;
    // instead each test uses a unique fileKey to avoid cross-test collision.
  });

  it('resolves immediately when the line is already registered', async () => {
    const el = fakeEl();
    lineRegistry.registerLine('fileA.ts', 10, el);

    const result = await lineRegistry.waitForLine('fileA.ts', 10, 1000);
    expect(result).toBe(el);
  });

  it('resolves once the line registers after the wait started', async () => {
    const el = fakeEl();
    const promise = lineRegistry.waitForLine('fileB.ts', 5, 1000);

    lineRegistry.registerLine('fileB.ts', 5, el);

    const result = await promise;
    expect(result).toBe(el);
  });

  it('resolves with null when the timeout elapses before registration', async () => {
    const result = await lineRegistry.waitForLine('fileC.ts', 1, 20);
    expect(result).toBeNull();
  });

  it('removes the entry on unregister so a later wait times out', async () => {
    const el = fakeEl();
    lineRegistry.registerLine('fileD.ts', 3, el);
    lineRegistry.unregisterLine('fileD.ts', 3, el);

    const result = await lineRegistry.waitForLine('fileD.ts', 3, 20);
    expect(result).toBeNull();
  });

  it('ignores unregister when the element no longer matches (stale unmount)', async () => {
    const oldEl = fakeEl();
    const newEl = fakeEl();
    lineRegistry.registerLine('fileE.ts', 7, oldEl);
    lineRegistry.registerLine('fileE.ts', 7, newEl);

    // Stale cleanup for the old element must not evict the new registration
    lineRegistry.unregisterLine('fileE.ts', 7, oldEl);

    const result = await lineRegistry.waitForLine('fileE.ts', 7, 1000);
    expect(result).toBe(newEl);
  });

  it('keeps the same line number distinct across different files', async () => {
    const elX = fakeEl();
    const elY = fakeEl();
    lineRegistry.registerLine('fileX.ts', 42, elX);
    lineRegistry.registerLine('fileY.ts', 42, elY);

    const resultX = await lineRegistry.waitForLine('fileX.ts', 42, 1000);
    const resultY = await lineRegistry.waitForLine('fileY.ts', 42, 1000);

    expect(resultX).toBe(elX);
    expect(resultY).toBe(elY);
    expect(resultX).not.toBe(resultY);
  });
});
