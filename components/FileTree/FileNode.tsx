import React, { useState } from 'react';
import { FileTreeNode } from '../../types';
import { getFileColor, getStatusColorClass } from '../../utils/colorUtils';
import { ChevronRight, ChevronDown, File, Folder, FileJson, FileCode, FileText } from 'lucide-react';
import clsx from 'clsx';
import { usePR } from '../../contexts/PRContext';
import { arePathsEquivalent } from '../../utils/fileUtils';

interface FileNodeProps {
  node: FileTreeNode;
  depth?: number;
}

const FileIcon = ({ name, className }: { name: string; className?: string }) => {
  if (name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.js')) return <FileCode className={className} />;
  if (name.endsWith('.json')) return <FileJson className={className} />;
  if (name.endsWith('.md')) return <FileText className={className} />;
  return <File className={className} />;
};

export const FileNode: React.FC<FileNodeProps> = ({ node, depth = 0 }) => {
  const [isOpen, setIsOpen] = useState(true);
  const { selectedFile, selectFile, walkthrough, activeSectionId } = usePR();

  const isDirectory = node.type === 'directory';
  const isSelected = !isDirectory && selectedFile?.path === node.data?.path;
  
  // Walkthrough highlight logic
  const isHighlightedInActiveSection = activeSectionId && walkthrough?.sections.find(s => s.id === activeSectionId)?.files.some(f => 
      node.data && arePathsEquivalent(f, node.data.path)
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      setIsOpen(!isOpen);
    } else if (node.data) {
      selectFile(node.data);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick(e as any);
    }
  };

  const statusColor = node.data 
    ? getStatusColorClass(node.data.status, node.data.additions, node.data.deletions, node.data.newContent)
    : 'text-gray-400';

  return (
    <div>
      <div
        className={clsx(
          "flex items-center py-1 px-2 cursor-pointer transition-colors text-sm select-none",
          isSelected ? "bg-blue-900/50 border-r-2 border-blue-500" : "hover:bg-gray-800",
          isHighlightedInActiveSection && !isSelected ? "bg-purple-900/30 border-l-2 border-purple-500" : ""
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-selected={isSelected}
      >
        <span className="mr-1 text-gray-500">
          {isDirectory ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
             <span className="w-3.5 inline-block" />
          )}
        </span>
        
        <span className={clsx("mr-2", isDirectory ? "text-yellow-500" : statusColor)}>
          {isDirectory ? <Folder size={14} /> : <FileIcon name={node.name} className="w-3.5 h-3.5" />}
        </span>

        <span className={clsx("truncate", isSelected ? "text-white font-medium" : "text-gray-300")}>
          {node.name}
        </span>

        {node.data && (node.data.status !== 'unchanged') && (
            <span className="ml-auto flex gap-1 text-[10px] font-mono opacity-60">
                {node.data.additions > 0 && <span className="text-green-400">+{node.data.additions}</span>}
                {node.data.deletions > 0 && <span className="text-red-400">-{node.data.deletions}</span>}
            </span>
        )}
      </div>

      {isDirectory && isOpen && node.children && (
        <div role="group">
          {node.children.map(child => (
            <FileNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};