
export interface PRData {
  id: string;
  title: string;
  description: string;
  author: string;
  baseRef: string;
  headRef: string;
  files: FileChange[];
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';

export interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  oldContent?: string;
  newContent: string;
}

export interface Walkthrough {
  title: string;
  author?: string;
  sections: WalkthroughSection[];
}

export interface WalkthroughSection {
  id: string;
  title: string;
  files: string[];
  description: string;
  highlights?: CodeHighlight[];
}

export interface CodeHighlight {
  file: string;
  lines: [number, number];
  note: string;
}

export interface ViewportState {
  file: string | null;
  startLine: number;
  endLine: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'system' | 'assistant';
  content: string;
  timestamp: number;
  context?: {
    file: string;
    lineRange?: [number, number];
  };
}

// Tree structure for file navigation
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  data?: FileChange; // Only present for files that are part of the PR
}

export interface PRHistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  author: string;
}
