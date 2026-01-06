/**
 * src/modules/runtime/index.ts
 * Runtime Module - Browser-native code execution via WebContainers.
 * The Agent's "Legs" - ability to run npm test, node scripts, and verify builds.
 */

export { runtime, WebContainerService } from './WebContainerService';
export * from './types';
