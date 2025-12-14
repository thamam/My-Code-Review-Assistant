import { PRData, FileChange, FileStatus } from '../types';

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

    // 2. Fetch Files List
    const filesResponse = await fetch(`${baseUrl}/pulls/${number}/files?per_page=100`, { headers });
    if (!filesResponse.ok) throw new Error(`Failed to fetch files: ${filesResponse.statusText}`);
    const filesData: GitHubFile[] = await filesResponse.json();

    // 3. Process Files and Fetch Content
    // Limit to first 20 files to avoid rate limits/performance issues in this PoC
    const filesToProcess = filesData.slice(0, 20);
    
    const processedFiles: FileChange[] = await Promise.all(filesToProcess.map(async (file) => {
      let oldContent = '';
      let newContent = '';

      // Helper to fetch raw content
      // Strategy: 
      // - If Token is provided, use API (supports Private repos).
      // - If No Token, use raw.githubusercontent.com (saves API Rate Limit for Public repos).
      const fetchContent = async (sha: string, path: string) => {
        try {
          if (this.token) {
             const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, {
                 headers: {
                     ...this.getHeaders(),
                     'Accept': 'application/vnd.github.v3.raw' // Returns raw content directly
                 }
             });
             if (res.ok) return await res.text();
             console.warn(`Failed to fetch content via API for ${path}: ${res.status} ${res.statusText}`);
             return '';
          } else {
             // Fallback to raw domain for public repos to save API quota
             const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`);
             if (res.ok) return await res.text();
             console.warn(`Failed to fetch content via Raw for ${path}: ${res.status}`);
             return '';
          }
        } catch (e) {
          console.error(`Failed to fetch content for ${path}`, e);
          return '';
        }
      };

      if (file.status !== 'added') {
        // If renamed, the file was at 'previous_filename' in the base commit
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
    }));

    return {
      id: prData.number.toString(),
      title: prData.title,
      description: prData.body || 'No description provided.',
      author: prData.user.login,
      baseRef: prData.base.ref,
      headRef: prData.head.ref,
      files: processedFiles
    };
  }
}
