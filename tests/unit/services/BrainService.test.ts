import { describe, it, expect } from 'vitest';
import { buildDeepInsightPrompt, generateDeepInsight } from '../../../src/services/BrainService';

describe('buildDeepInsightPrompt', () => {
  it('embeds the file path and content into the prompt', () => {
    const prompt = buildDeepInsightPrompt('src/foo.ts', 'export const x = 1;');
    expect(prompt).toContain('File: src/foo.ts');
    expect(prompt).toContain('export const x = 1;');
    expect(prompt).toContain('TASK:');
  });
});

describe('generateDeepInsight', () => {
  it('no-ops without calling the model when content is empty', async () => {
    const result = await generateDeepInsight('src/empty.ts', '');
    expect(result).toBeNull();
  });
});
