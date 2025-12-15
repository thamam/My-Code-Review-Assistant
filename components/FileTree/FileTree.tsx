import React, { useMemo, useState, useEffect } from 'react';
import { usePR } from '../../contexts/PRContext';
import { buildFileTree } from '../../utils/fileUtils';
import { FileNode } from './FileNode';
import { AlertTriangle, ChevronsDown, ChevronsUp, FolderOpen, FolderClosed } from 'lucide-react';
import { FileTreeNode } from '../../types';

export const FileTree: React.FC = () => {
  const { prData } = usePR();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const treeData = useMemo(() => {
    return prData ? buildFileTree(prData.files) : [];
  }, [prData]);

  // Initial Expand All
  useEffect(() => {
      if (treeData.length > 0) {
          const allDirs = new Set<string>();
          const traverse = (nodes: FileTreeNode[]) => {
              nodes.forEach(n => {
                  if (n.type === 'directory') {
                      allDirs.add(n.path);
                      if (n.children) traverse(n.children);
                  }
              });
          };
          traverse(treeData);
          setExpandedPaths(allDirs);
      }
  }, [treeData]);

  const togglePath = (path: string) => {
      setExpandedPaths(prev => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
      });
  };

  const expandAll = () => {
      const allDirs = new Set<string>();
      const traverse = (nodes: FileTreeNode[]) => {
          nodes.forEach(n => {
              if (n.type === 'directory') {
                  allDirs.add(n.path);
                  if (n.children) traverse(n.children);
              }
          });
      };
      traverse(treeData);
      setExpandedPaths(allDirs);
  };

  const collapseAll = () => {
      setExpandedPaths(new Set());
  };

  if (!prData) return <div className="p-4 text-gray-500">No PR loaded</div>;

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800 select-none">
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-900">
        <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Files</h2>
            <div className="text-[10px] text-gray-500 mt-0.5">
                {prData.files.filter(f => f.status !== 'unchanged').length} changed
            </div>
        </div>
        <div className="flex gap-1">
            <button onClick={expandAll} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded" title="Expand All">
                <FolderOpen size={14} />
            </button>
            <button onClick={collapseAll} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded" title="Collapse All">
                <FolderClosed size={14} />
            </button>
        </div>
      </div>
      
      {prData.warning && (
          <div className="bg-yellow-900/20 border-b border-yellow-800 p-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-[10px] text-yellow-200 leading-tight">{prData.warning}</span>
          </div>
      )}

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar" role="tree">
        {treeData.map(node => (
          <FileNode 
            key={node.path} 
            node={node} 
            expandedPaths={expandedPaths}
            onToggle={togglePath}
          />
        ))}
      </div>
    </div>
  );
};