
import { FileChange, FileTreeNode } from '../types';

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').trim();
}

export function arePathsEquivalent(path1: string, path2: string): boolean {
    const p1 = normalizePath(path1);
    const p2 = normalizePath(path2);
    
    if (p1 === p2) return true;
    
    const endsWith = (full: string, suffix: string) => {
        return full.endsWith(suffix) && (full.length === suffix.length || full[full.length - suffix.length - 1] === '/');
    };

    return endsWith(p1, p2) || endsWith(p2, p1);
}

export function resolveFilePath(
  referencePath: string, 
  prFiles: string[]
): { resolved: string | null; confidence: 'exact' | 'fuzzy' | 'none' } {
  const normalizedRef = normalizePath(referencePath);
  
  // 1. Exact match
  if (prFiles.includes(normalizedRef)) {
    return { resolved: normalizedRef, confidence: 'exact' };
  }
  
  // 2. Basename match (single result)
  const basename = normalizedRef.split('/').pop();
  const basenameMatches = prFiles.filter(f => f.endsWith(`/${basename}`) || f === basename);
  if (basenameMatches.length === 1) {
    return { resolved: basenameMatches[0], confidence: 'fuzzy' };
  }
  
  // 3. Suffix match
  const suffixMatches = prFiles.filter(f => f.endsWith(normalizedRef));
  if (suffixMatches.length === 1) {
    return { resolved: suffixMatches[0], confidence: 'fuzzy' };
  }
  
  return { resolved: null, confidence: 'none' };
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
