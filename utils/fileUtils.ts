import { FileChange, FileTreeNode } from '../types';

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').trim();
}

export function arePathsEquivalent(path1: string, path2: string): boolean {
    const p1 = normalizePath(path1);
    const p2 = normalizePath(path2);
    
    if (p1 === p2) return true;
    
    // Check if one is a suffix of the other (handling absolute vs relative)
    // We require a path separator or start of string to avoid partial filename matches
    // e.g. "main.py" should match "src/main.py" but "app.ts" shouldn't match "mapp.ts"
    
    const endsWith = (full: string, suffix: string) => {
        return full.endsWith(suffix) && (full.length === suffix.length || full[full.length - suffix.length - 1] === '/');
    };

    return endsWith(p1, p2) || endsWith(p2, p1);
}

export function buildFileTree(files: FileChange[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  files.forEach(file => {
    const parts = file.path.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      
      let existingNode = currentLevel.find(node => node.name === part);

      if (!existingNode) {
        existingNode = {
          name: part,
          path,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
          data: isFile ? file : undefined
        };
        currentLevel.push(existingNode);
      }

      if (!isFile && existingNode.children) {
        currentLevel = existingNode.children;
      }
    });
  });

  // Sort: Directories first, then files
  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(root);
  return root;
}