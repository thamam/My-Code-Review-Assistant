import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from '../../../services/github';

function response(body: any, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: 'ERR',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

const prMeta = (number: number) => ({
  number,
  title: 'A title',
  body: 'A body',
  user: { login: 'alice' },
  base: { ref: 'main', sha: 'basesha', repo: { owner: { login: 'o' }, name: 'r' } },
  head: { ref: 'feat', sha: 'headsha' },
});

describe('GitHubService.fetchPR — per-file failure isolation (B1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a file contentUnavailable when its content fetch fails, without failing the whole PR load', async () => {
    const service = new GitHubService('tok');
    const files = [
      { filename: 'good.ts', status: 'modified', additions: 1, deletions: 0 },
      { filename: 'bad.ts', status: 'modified', additions: 1, deletions: 0 },
    ];

    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      if (u.includes('/pulls/1') && !u.includes('/files')) return response(prMeta(1));
      if (u.includes('/files?')) return response(files);
      if (u.includes('good.ts')) return response('good content');
      if (u.includes('bad.ts')) return response('', false, 500);
      return response('', false, 404);
    }) as any;

    const data = await service.fetchPR('https://github.com/o/r/pull/1');

    expect(data.files).toHaveLength(2); // the PR still loads despite bad.ts failing

    const good = data.files.find(f => f.path === 'good.ts')!;
    expect(good.contentUnavailable).toBeUndefined();
    expect(good.newContent).toBe('good content');
    expect(good.oldContent).toBe('good content');

    const bad = data.files.find(f => f.path === 'bad.ts')!;
    expect(bad.contentUnavailable).toBe(true);
    expect(bad.newContent).toBe('');
    expect(bad.oldContent).toBe('');
  });

  it('does not mark contentUnavailable, and leaves oldContent undefined, for an added file (old content never fetched)', async () => {
    const service = new GitHubService('tok');
    const files = [{ filename: 'new.ts', status: 'added', additions: 3, deletions: 0 }];

    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      if (u.includes('/pulls/2') && !u.includes('/files')) return response(prMeta(2));
      if (u.includes('/files?')) return response(files);
      return response('brand new file');
    }) as any;

    const data = await service.fetchPR('https://github.com/o/r/pull/2');
    const file = data.files[0];

    expect(file.contentUnavailable).toBeUndefined();
    expect(file.oldContent).toBeUndefined();
    expect(file.newContent).toBe('brand new file');
  });

  it('preserves a genuinely empty old file as "" rather than collapsing it to undefined', async () => {
    const service = new GitHubService('tok');
    const files = [{ filename: 'wasEmpty.ts', status: 'modified', additions: 1, deletions: 0 }];

    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      if (u.includes('/pulls/3') && !u.includes('/files')) return response(prMeta(3));
      if (u.includes('/files?')) return response(files);
      if (u.includes('ref=basesha')) return response(''); // old content: legitimately empty
      return response('now has content'); // new content
    }) as any;

    const data = await service.fetchPR('https://github.com/o/r/pull/3');
    const file = data.files[0];

    expect(file.contentUnavailable).toBeUndefined();
    expect(file.oldContent).toBe('');
    expect(file.newContent).toBe('now has content');
  });
});

describe('GitHubService.fetchPR — unauthenticated raw URL path encoding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes each path segment but preserves literal slashes for raw.githubusercontent.com', async () => {
    const service = new GitHubService(); // no token -> unauthenticated branch
    const files = [{ filename: 'src/my file.ts', status: 'added', additions: 1, deletions: 0 }];
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (url: any) => {
      const u = url.toString();
      requestedUrls.push(u);
      if (u.includes('/pulls/4') && !u.includes('/files')) return response(prMeta(4));
      if (u.includes('/files?')) return response(files);
      return response('content');
    }) as any;

    await service.fetchPR('https://github.com/o/r/pull/4');

    const contentUrl = requestedUrls.find(u => u.includes('raw.githubusercontent.com'));
    expect(contentUrl).toBe('https://raw.githubusercontent.com/o/r/headsha/src/my%20file.ts');
  });
});

describe('GitHubService.fetchFileContent — UTF-8 base64 decode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes non-ASCII (Hebrew + emoji + em-dash) content without mojibake', async () => {
    const service = new GitHubService('tok');
    const original = 'שלום 🌍 — unicode test';

    // Pre-encode the same way GitHub does: UTF-8 bytes -> base64
    const utf8Bytes = new TextEncoder().encode(original);
    let binary = '';
    for (const b of utf8Bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary);

    global.fetch = vi.fn(async () => {
      return response({ encoding: 'base64', content: b64 });
    }) as any;

    const result = await service.fetchFileContent('o', 'r', 'file.md', 'main');
    expect(result).toBe(original);
  });
});
