/**
 * Adapters Index
 * 
 * Hexagonal Ports for Phase 7: Spec-Driven Traceability
 * 
 * Exports all adapters that can feed content to the Atomizer.
 */

export { LinearAdapter, createLinearAdapter } from './LinearAdapter';
export { FileAdapter, fileAdapter, pickAndReadSpecFile } from './FileAdapter';
