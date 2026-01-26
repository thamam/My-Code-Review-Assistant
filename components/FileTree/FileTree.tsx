import React, { useMemo, useState, useEffect } from 'react';
import { usePR } from '../../contexts/PRContext';
import { buildFileTree } from '../../utils/fileUtils';
import { FileNode } from './FileNode';
import { AlertTriangle, FolderOpen, FolderClosed, Loader2, Eye, EyeOff } from 'lucide-react';
import { FileTreeNode, FileChange, RepoNode } from '../../types';
import clsx from 'clsx';

/**
 * Builds a merged file tree from PR files and full repo tree.
 * PR files are marked with their status, repo-only files are marked as ghosts.
 */
function buildMergedTree(prFiles: FileChange[], repoTree: RepoNode[]): FileTreeNode[] {
    const prFilePaths = new Set(prFiles.map(f => f.path));
    const prFileMap = new Map(prFiles.map(f => [f.path, f]));

    const root: FileTreeNode[] = [];

    // Process all blobs from repo tree
    const blobs = repoTree.filter(n => n.type === 'blob');

    blobs.forEach(node => {
        const parts = node.path.split('/');
        let currentLevel = root;

        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const path = parts.slice(0, index + 1).join('/');

            let existingNode = currentLevel.find(n => n.name === part);

            if (!existingNode) {
                const prFile = isFile ? prFileMap.get(node.path) : undefined;
                existingNode = {
                    name: part,
                    path,
                    type: isFile ? 'file' : 'directory',
                    children: isFile ? undefined : [],
                    data: prFile, // Will be undefined for ghost files
                    isGhost: isFile && !prFilePaths.has(node.path)
                } as FileTreeNode & { isGhost?: boolean };
                currentLevel.push(existingNode);
            }

            if (!isFile && existingNode.children) {
                currentLevel = existingNode.children;
            }
        });
    });

    // Sort: directories first, then alphabetically
    const sortNodes = (nodes: FileTreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });
        nodes.forEach(n => { if (n.children) sortNodes(n.children); });
    };

    sortNodes(root);
    return root;
}

export const FileTree: React.FC = () => {
    const {
        prData,
        repoTree,
        isFullRepoMode,
        isLoadingRepoTree,
        toggleFullRepoMode,
        loadGhostFile,
        selectFile
    } = usePR();
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    // Build tree based on mode
    const treeData = useMemo(() => {
        if (!prData) return [];

        if (isFullRepoMode && repoTree.length > 0) {
            return buildMergedTree(prData.files, repoTree);
        }

        return buildFileTree(prData.files);
    }, [prData, isFullRepoMode, repoTree]);

    // Initial Expand All (only for PR files mode)
    useEffect(() => {
        if (treeData.length > 0 && !isFullRepoMode) {
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
    }, [treeData, isFullRepoMode]);

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

    // Handle ghost file click - load content then select
    const handleGhostFileClick = async (path: string) => {
        const lazyFile = await loadGhostFile(path);
        if (lazyFile) {
            // Create a synthetic FileChange for display
            const syntheticFile: FileChange = {
                path: lazyFile.path,
                status: 'unchanged',
                additions: 0,
                deletions: 0,
                newContent: lazyFile.content,
                oldContent: lazyFile.content
            };
            selectFile(syntheticFile);
        }
    };

    if (!prData) return <div className="p-4 text-gray-500">No PR loaded</div>;

    const changedCount = prData.files.filter(f => f.status !== 'unchanged').length;
    const totalCount = isFullRepoMode && repoTree.length > 0
        ? repoTree.filter(n => n.type === 'blob').length
        : prData.files.length;

    return (
        <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800 select-none">
            <div className="p-3 border-b border-gray-800 bg-gray-900">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Files</h2>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                            {changedCount} changed{isFullRepoMode && ` / ${totalCount} total`}
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

                {/* Phase 9: Show All Files Toggle */}
                <button
                    onClick={toggleFullRepoMode}
                    disabled={isLoadingRepoTree}
                    data-testid="full-repo-toggle"
                    className={clsx(
                        "mt-2 w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs transition-colors",
                        isFullRepoMode
                            ? "bg-purple-600/20 border border-purple-500/50 text-purple-300"
                            : "bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                    )}
                >
                    {isLoadingRepoTree ? (
                        <>
                            <Loader2 size={12} className="animate-spin" />
                            Loading tree...
                        </>
                    ) : (
                        <>
                            {isFullRepoMode ? <EyeOff size={12} /> : <Eye size={12} />}
                            {isFullRepoMode ? 'Show Changes Only' : 'Show All Files'}
                        </>
                    )}
                </button>
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
                        onGhostClick={handleGhostFileClick}
                    />
                ))}
            </div>
        </div>
    );
};