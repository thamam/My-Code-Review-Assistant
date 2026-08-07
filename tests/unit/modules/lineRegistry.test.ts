import { describe, it, expect, beforeEach } from 'vitest';
import { lineRegistry, findNearestLine } from '../../../src/modules/navigation/lineRegistry';

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

  describe('side-keying', () => {
    it('keeps the same line number distinct across old/new sides in the same file', async () => {
      const oldEl = fakeEl();
      const newEl = fakeEl();
      lineRegistry.registerLine('fileSide.ts', 10, oldEl, 'old');
      lineRegistry.registerLine('fileSide.ts', 10, newEl, 'new');

      const resultOld = await lineRegistry.waitForLine('fileSide.ts', 10, 1000, 'old');
      const resultNew = await lineRegistry.waitForLine('fileSide.ts', 10, 1000, 'new');

      expect(resultOld).toBe(oldEl);
      expect(resultNew).toBe(newEl);
      expect(resultOld).not.toBe(resultNew);
    });

    it('defaults to the new side when side is omitted, for backward compatibility', async () => {
      const el = fakeEl();
      lineRegistry.registerLine('fileDefault.ts', 3, el);

      const viaDefault = await lineRegistry.waitForLine('fileDefault.ts', 3, 1000);
      const viaExplicitNew = await lineRegistry.waitForLine('fileDefault.ts', 3, 1000, 'new');
      const viaOld = await lineRegistry.waitForLine('fileDefault.ts', 3, 20, 'old');

      expect(viaDefault).toBe(el);
      expect(viaExplicitNew).toBe(el);
      expect(viaOld).toBeNull();
    });

    it('unregister only removes the matching side', async () => {
      const oldEl = fakeEl();
      const newEl = fakeEl();
      lineRegistry.registerLine('fileSide2.ts', 8, oldEl, 'old');
      lineRegistry.registerLine('fileSide2.ts', 8, newEl, 'new');

      lineRegistry.unregisterLine('fileSide2.ts', 8, oldEl, 'old');

      const resultOld = await lineRegistry.waitForLine('fileSide2.ts', 8, 20, 'old');
      const resultNew = await lineRegistry.waitForLine('fileSide2.ts', 8, 1000, 'new');
      expect(resultOld).toBeNull();
      expect(resultNew).toBe(newEl);
    });

    it('waits independently per side when registration comes after the wait started', async () => {
      const oldEl = fakeEl();
      const promiseOld = lineRegistry.waitForLine('fileSide3.ts', 6, 1000, 'old');
      const promiseNew = lineRegistry.waitForLine('fileSide3.ts', 6, 1000, 'new');

      lineRegistry.registerLine('fileSide3.ts', 6, oldEl, 'old');

      expect(await promiseOld).toBe(oldEl);
      expect(await promiseNew).toBeNull();
    });
  });

  describe('findNearestLine', () => {
    it('returns null when nothing is registered for that file', () => {
      expect(findNearestLine('nearestEmpty.ts', 'new', 10)).toBeNull();
    });

    it('returns the exact line when it is registered', () => {
      lineRegistry.registerLine('nearestExact.ts', 10, fakeEl(), 'new');
      expect(findNearestLine('nearestExact.ts', 'new', 10)).toBe(10);
    });

    it('returns the closest registered line on the requested side', () => {
      lineRegistry.registerLine('nearestClosest.ts', 5, fakeEl(), 'new');
      lineRegistry.registerLine('nearestClosest.ts', 20, fakeEl(), 'new');
      // 12 is closer to 5 (dist 7) than to 20 (dist 8)
      expect(findNearestLine('nearestClosest.ts', 'new', 12)).toBe(5);
      // 15 is closer to 20 (dist 5) than to 5 (dist 10)
      expect(findNearestLine('nearestClosest.ts', 'new', 15)).toBe(20);
    });

    it('only considers lines registered on the requested side', () => {
      lineRegistry.registerLine('nearestSide.ts', 10, fakeEl(), 'old');
      expect(findNearestLine('nearestSide.ts', 'new', 10)).toBeNull();
      expect(findNearestLine('nearestSide.ts', 'old', 10)).toBe(10);
    });
  });
});
