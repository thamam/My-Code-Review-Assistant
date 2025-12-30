import { PRData, FileChange, FileStatus, RepoNode } from '../types';

interface GitHubPR {
  number: number;
  title: string;
  body: string;
  user: { login: string };
  base: { ref: string; sha: string; repo: { owner: { login: string }; name: string } };
  head: { ref: string; sha: string };
}

interface GitHubFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

// Phase 9: GitHub Tree API response types
interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export class GitHubService {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private getHeaders() {
    return this.token
      ? { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
      : { 'Accept': 'application/vnd.github.v3+json' };
  }

  private mapStatus(status: string): FileStatus {
    switch (status) {
      case 'added': return 'added';
      case 'removed': return 'deleted';
      case 'modified': return 'modified';
      case 'renamed': return 'renamed';
      case 'unchanged': return 'unchanged';
      default: return 'modified';
    }
  }

  async parsePRUrl(url: string) {
    // Matches https://github.com/owner/repo/pull/123
    const regex = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
    const match = url.match(regex);
    if (!match) throw new Error("Invalid GitHub PR URL");
    return { owner: match[1], repo: match[2], number: parseInt(match[3]) };
  }

  async fetchPR(url: string): Promise<PRData> {
    const { owner, repo, number } = await this.parsePRUrl(url);
    const headers = this.getHeaders();
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

    // 1. Fetch PR Metadata
    const prResponse = await fetch(`${baseUrl}/pulls/${number}`, { headers });

    if (prResponse.status === 403) throw new Error("GitHub API Rate Limit Exceeded. Please provide an Access Token.");
    if (prResponse.status === 404) throw new Error("PR not found. If this is a private repo, please provide an Access Token.");
    if (!prResponse.ok) throw new Error(`Failed to fetch PR: ${prResponse.statusText}`);

    const prData: GitHubPR = await prResponse.json();

    // 2. Fetch Files List with Pagination
    let allFiles: GitHubFile[] = [];
    let page = 1;
    let keepFetching = true;
    const MAX_FILES = 1000; // Hard safety limit
    const PER_PAGE = 100;
    let warningMsg = undefined;

    while (keepFetching) {
      const filesUrl = `${baseUrl}/pulls/${number}/files?per_page=${PER_PAGE}&page=${page}`;
      const filesResponse = await fetch(filesUrl, { headers });

      if (!filesResponse.ok) {
        console.warn(`Failed to fetch files page ${page}: ${filesResponse.statusText}`);
        warningMsg = `Partial file list loaded (stopped at page ${page - 1} due to API error)`;
        break;
      }

      const pageData: GitHubFile[] = await filesResponse.json();
      allFiles = allFiles.concat(pageData);

      if (pageData.length < PER_PAGE) {
        keepFetching = false;
      } else {
        page++;
      }

      if (allFiles.length >= MAX_FILES) {
        keepFetching = false;
        warningMsg = `PR is too large. Only the first ${MAX_FILES} files were loaded.`;
      }
    }

    // 3. Process Files and Fetch Content (Batched)
    // We limit concurrency to prevent browser/network bottlenecks
    const BATCH_SIZE = 20;
    const processedFiles: FileChange[] = [];

    const fetchContent = async (sha: string, path: string) => {
      try {
        if (this.token) {
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, {
            headers: {
              ...this.getHeaders(),
              'Accept': 'application/vnd.github.v3.raw'
            }
          });
          if (res.ok) return await res.text();
          return '';
        } else {
          const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`);
          if (res.ok) return await res.text();
          return '';
        }
      } catch (e) {
        console.error(`Failed to fetch content for ${path}`, e);
        return '';
      }
    };

    // Helper to process a single file
    const processFile = async (file: GitHubFile): Promise<FileChange> => {
      let oldContent = '';
      let newContent = '';

      if (file.status !== 'added') {
        const originalPath = file.previous_filename || file.filename;
        oldContent = await fetchContent(prData.base.sha, originalPath);
      }

      if (file.status !== 'removed') {
        newContent = await fetchContent(prData.head.sha, file.filename);
      }

      return {
        path: file.filename,
        status: this.mapStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
        oldContent: oldContent || undefined,
        newContent: newContent || ''
      };
    };

    // Execute batches
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(file => processFile(file)));
      processedFiles.push(...results);
    }

    return {
      id: prData.number.toString(),
      title: prData.title,
      description: prData.body || 'No description provided.',
      author: prData.user.login,
      baseRef: prData.base.ref,
      headRef: prData.head.ref,
      files: processedFiles,
      warning: warningMsg,
      // Phase 9: Include repo info for lazy loading
      owner: prData.base.repo.owner.login,
      repo: prData.base.repo.name,
      headSha: prData.head.sha
    };
  }

  /**
   * Phase 9: Fetch the complete repository tree at a given commit SHA.
   * Uses GitHub Git Trees API with recursive=1 to get all files.
   * 
   * @param owner - Repository owner
   * @param repo - Repository name  
   * @param sha - Commit SHA (usually head.sha from the PR)
   * @returns Array of RepoNode objects representing all files in the repo
   */
  async fetchRepoTree(owner: string, repo: string, sha: string): Promise<RepoNode[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;

    const response = await fetch(url, { headers: this.getHeaders() });

    if (response.status === 403) {
      throw new Error("GitHub API Rate Limit Exceeded. Please provide an Access Token.");
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch repository tree: ${response.statusText}`);
    }

    const data: GitHubTreeResponse = await response.json();

    if (data.truncated) {
      console.warn('[GitHubService] Repository tree was truncated due to size limits');
    }

    // Map to our RepoNode interface
    return data.tree.map(item => ({
      path: item.path,
      type: item.type,
      sha: item.sha,
      mode: item.mode,
      size: item.size
    }));
  }

  /**
   * Phase 9: Fetch content of a single file by path.
   * Used for lazy loading non-PR files when user navigates to them.
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - File path (e.g., "src/utils/auth.ts")
   * @param ref - Git ref (branch, tag, or SHA)
   * @returns File content as a string
   */
  async fetchFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;

    const response = await fetch(url, { headers: this.getHeaders() });

    if (response.status === 403) {
      throw new Error("GitHub API Rate Limit Exceeded.");
    }
    if (response.status === 404) {
      throw new Error(`File not found: ${path}`);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    const data = await response.json();

    // GitHub returns content as base64 encoded
    if (data.encoding === 'base64' && data.content) {
      // Decode base64 content
      return atob(data.content.replace(/\n/g, ''));
    }

    // If content is not base64 (shouldn't happen for normal files)
    return data.content || '';
  }
}