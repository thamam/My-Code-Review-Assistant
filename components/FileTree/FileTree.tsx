import React, { useMemo } from 'react';
import { usePR } from '../../contexts/PRContext';
import { buildFileTree } from '../../utils/fileUtils';
import { FileNode } from './FileNode';
import { AlertTriangle } from 'lucide-react';

export const FileTree: React.FC = () => {
  const { prData } = usePR();

  const treeData = useMemo(() => {
    return prData ? buildFileTree(prData.files) : [];
  }, [prData]);

  if (!prData) return <div className="p-4 text-gray-500">No PR loaded</div>;

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800 select-none">
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Files</h2>
        <div className="text-xs text-gray-500 mt-1">
            {prData.files.filter(f => f.status !== 'unchanged').length} changed files
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
          <FileNode key={node.path} node={node} />
        ))}
      </div>
    </div>
  );
};