import { describe, it, expect } from 'vitest';
import { resolveActiveFileContent, ACTIVE_FILE_CONTENT_LIMIT } from '../../../src/types/context';
import type { FileChange } from '../../../types';
import type { LazyFile } from '../../../src/modules/navigation/types';

describe('resolveActiveFileContent', () => {
  it('returns null when there is no selected file', () => {
    expect(resolveActiveFileContent(null)).toBeNull();
  });

  it('uses newContent for a FileChange', () => {
    const file: FileChange = {
      path: 'src/foo.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      newContent: 'export const x = 1;',
    };
    expect(resolveActiveFileContent(file)).toEqual({ content: 'export const x = 1;', truncated: false });
  });

  it('falls back to oldContent for a deleted file (empty newContent)', () => {
    const file: FileChange = {
      path: 'src/gone.ts',
      status: 'deleted',
      additions: 0,
      deletions: 5,
      oldContent: 'export const gone = true;',
      newContent: '',
    };
    expect(resolveActiveFileContent(file)).toEqual({ content: 'export const gone = true;', truncated: false });
  });

  it('returns null when both newContent and oldContent are empty', () => {
    const file: FileChange = {
      path: 'src/empty.ts',
      status: 'modified',
      additions: 0,
      deletions: 0,
      newContent: '',
    };
    expect(resolveActiveFileContent(file)).toBeNull();
  });

  it('uses .content for a LazyFile', () => {
    const lazy: LazyFile = {
      path: 'src/lazy.ts',
      content: 'const lazy = true;',
      sha: 'abc123',
      size: 20,
      status: 'warm',
      isReadOnly: true,
    };
    expect(resolveActiveFileContent(lazy)).toEqual({ content: 'const lazy = true;', truncated: false });
  });

  it('returns null for a ghost LazyFile with null content', () => {
    const ghost: LazyFile = {
      path: 'src/ghost.ts',
      content: null,
      sha: 'def456',
      size: 20,
      status: 'ghost',
      isReadOnly: true,
    };
    expect(resolveActiveFileContent(ghost)).toBeNull();
  });

  it('does not truncate content exactly at the limit', () => {
    const content = 'x'.repeat(ACTIVE_FILE_CONTENT_LIMIT);
    const file: FileChange = {
      path: 'src/big.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      newContent: content,
    };
    const result = resolveActiveFileContent(file);
    expect(result?.truncated).toBe(false);
    expect(result?.content).toBe(content);
    expect(result?.content.length).toBe(ACTIVE_FILE_CONTENT_LIMIT);
  });

  it('truncates content one char over the limit', () => {
    const content = 'x'.repeat(ACTIVE_FILE_CONTENT_LIMIT + 1);
    const file: FileChange = {
      path: 'src/toobig.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      newContent: content,
    };
    const result = resolveActiveFileContent(file);
    expect(result?.truncated).toBe(true);
    expect(result?.content.length).toBe(ACTIVE_FILE_CONTENT_LIMIT);
  });
});
