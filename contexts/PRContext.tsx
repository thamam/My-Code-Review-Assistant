
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough, SelectionState, Annotation, LinearIssue, Diagram, NavigationTarget, RepoNode, LazyFile } from '../types';
import { resolveFilePath } from '../utils/fileUtils';
import { GitHubService } from '../services/github';

interface FocusedLocation {
  file: string;
  line: number;
  timestamp: number;
}

interface PRContextType {
  prData: PRData | null;
  setPRData: (data: PRData) => void;
  selectedFile: FileChange | null;
  selectFile: (file: FileChange) => void;
  viewportState: ViewportState;
  updateViewport: (state: Partial<ViewportState>) => void;
  selectionState: SelectionState | null;
  setSelectionState: (state: SelectionState | null) => void;
  walkthrough: Walkthrough | null;
  loadWalkthrough: (data: Walkthrough) => void;
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
  isDiffMode: boolean;
  setIsDiffMode: (value: boolean) => void;
  toggleDiffMode: () => void;
  focusedLocation: FocusedLocation | null;
  scrollToLine: (file: string, line: number) => void;
  navigateToCode: (target: NavigationTarget) => Promise<boolean>;
  setLeftTab: (tab: 'files' | 'annotations' | 'issue' | 'diagrams') => void;
  leftTab: 'files' | 'annotations' | 'issue' | 'diagrams';
  isCodeViewerReady: boolean;
  setIsCodeViewerReady: (ready: boolean) => void;
  annotations: Annotation[];
  addAnnotation: (file: string, line: number, type: 'marker' | 'label', text?: string) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  linearIssue: LinearIssue | null;
  setLinearIssue: (issue: LinearIssue | null) => void;
  diagrams: Diagram[];
  activeDiagram: Diagram | null;
  addDiagram: (diagram: Diagram) => void;
  removeDiagram: (id: string) => void;
  setActiveDiagram: (diagram: Diagram | null) => void;
  diagramViewMode: 'full' | 'split';
  setDiagramViewMode: (mode: 'full' | 'split') => void;
  diagramSplitPercent: number;
  setDiagramSplitPercent: (val: number) => void;
  setDiagrams: (diagrams: Diagram[]) => void;
  // Phase 9: Full Repo Context
  repoTree: RepoNode[];
  lazyFiles: Map<string, LazyFile>;
  isFullRepoMode: boolean;
  isLoadingRepoTree: boolean;
  toggleFullRepoMode: () => Promise<void>;
  loadGhostFile: (path: string) => Promise<LazyFile | null>;
}

const PRContext = createContext<PRContextType | undefined>(undefined);

export const PRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [prData, setPrData] = useState<PRData | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDiffMode, setIsDiffMode] = useState(true);
  const [leftTab, setLeftTab] = useState<'files' | 'annotations' | 'issue' | 'diagrams'>('files');
  const [isCodeViewerReady, setIsCodeViewerReady] = useState(false);
  const [viewportState, setViewportState] = useState<ViewportState>({ file: null, startLine: 0, endLine: 0 });
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<FocusedLocation | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [linearIssue, setLinearIssue] = useState<LinearIssue | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagram, setActiveDiagram] = useState<Diagram | null>(null);
  const [diagramViewMode, setDiagramViewMode] = useState<'full' | 'split'>('full');
  const [diagramSplitPercent, setDiagramSplitPercent] = useState(50);

  // Phase 9: Full Repo Context state
  const [repoTree, setRepoTree] = useState<RepoNode[]>([]);
  const [lazyFiles, setLazyFiles] = useState<Map<string, LazyFile>>(new Map());
  const [isFullRepoMode, setIsFullRepoMode] = useState(false);
  const [isLoadingRepoTree, setIsLoadingRepoTree] = useState(false);

  // GitHub service instance (for lazy loading)
  const githubServiceRef = useRef<GitHubService | null>(null);
  if (!githubServiceRef.current) {
    githubServiceRef.current = new GitHubService(import.meta.env.VITE_GITHUB_TOKEN);
  }

  const isCodeViewerReadyRef = useRef(false);
  // NEW: Navigation Lock to prevent race conditions
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => { isCodeViewerReadyRef.current = isCodeViewerReady; }, [isCodeViewerReady]);

  const selectFile = (file: FileChange) => {
    setSelectedFile(file);
    setViewportState({ file: file.path, startLine: 0, endLine: 0 });
    setSelectionState(null);
  };

  const navigateToCode = async (target: NavigationTarget): Promise<boolean> => {
    if (!prData || isNavigating) return false;

    try {
      setIsNavigating(true);

      // 5. Update Tab (Moved to top to ensure CodeViewer mounts if hidden)
      if (leftTab !== 'files' && target.source !== 'tree') {
        setLeftTab('files');
        // Allow React to render the tab switch
        await new Promise(r => setTimeout(r, 0));
      }

      // 1. Resolve path
      const resolution = resolveFilePath(target.filepath, prData.files.map(f => f.path));
      if (!resolution.resolved) {
        console.warn(`[PRContext] Navigation failed: Could not resolve ${target.filepath}`);
        return false;
      }

      const fileToSelect = prData.files.find(f => f.path === resolution.resolved);
      if (!fileToSelect) return false;

      // 2. Switch File if needed
      if (selectedFile?.path !== fileToSelect.path) {
        setIsCodeViewerReady(false);
        selectFile(fileToSelect);

        // 3. Wait for File Load (Spec §5.3)
        let attempts = 0;
        while (!isCodeViewerReadyRef.current && attempts < 50) { // 5s timeout
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
      }

      // 4. Scroll (via FocusedLocation state)
      // We add a timestamp to force updates even if line is same
      setFocusedLocation({
        file: fileToSelect.path,
        line: target.line,
        timestamp: Date.now()
      });

      return true;
    } catch (e) {
      console.error("Navigation error", e);
      return false;
    } finally {
      setIsNavigating(false);
    }
  };

  const scrollToLine = (file: string, line: number) => {
    navigateToCode({ filepath: file, line, source: 'annotation' });
  };

  const toggleDiffMode = () => setIsDiffMode(prev => !prev);
  const addAnnotation = (file: string, line: number, type: 'marker' | 'label', text?: string) => {
    const id = `${type}_${Date.now()}`;
    const title = text || (type === 'marker' ? `marker_${annotations.length + 1}` : 'New Label');
    setAnnotations(prev => [...prev, { id, file, line, type, title, timestamp: Date.now() }]);
  };

  // Phase 9: Toggle Full Repo Mode - fetches repo tree if needed
  const toggleFullRepoMode = useCallback(async () => {
    if (!prData?.owner || !prData?.repo || !prData?.headSha) {
      console.warn('[PRContext] Cannot toggle full repo mode: missing PR metadata');
      return;
    }

    // If turning on and tree is empty, fetch it
    if (!isFullRepoMode && repoTree.length === 0) {
      setIsLoadingRepoTree(true);
      try {
        const tree = await githubServiceRef.current!.fetchRepoTree(
          prData.owner,
          prData.repo,
          prData.headSha
        );
        setRepoTree(tree);
        console.log(`[PRContext] Loaded repo tree: ${tree.length} items`);
      } catch (e) {
        console.error('[PRContext] Failed to fetch repo tree:', e);
      } finally {
        setIsLoadingRepoTree(false);
      }
    }

    setIsFullRepoMode(prev => !prev);
  }, [prData, isFullRepoMode, repoTree.length]);

  // Phase 9: Load a "ghost" file (non-PR file) on demand
  const loadGhostFile = useCallback(async (path: string): Promise<LazyFile | null> => {
    // Check if already in PR files
    if (prData?.files.find(f => f.path === path)) {
      console.log(`[PRContext] File ${path} is in PR files, not a ghost`);
      return null;
    }

    // Check if already lazy-loaded
    if (lazyFiles.has(path)) {
      return lazyFiles.get(path)!;
    }

    // Fetch from GitHub
    if (!prData?.owner || !prData?.repo || !prData?.headSha) {
      console.warn('[PRContext] Cannot load ghost file: missing PR metadata');
      return null;
    }

    // Find SHA from repoTree
    const node = repoTree.find(n => n.path === path && n.type === 'blob');
    if (!node) {
      console.warn(`[PRContext] File ${path} not found in repo tree`);
      return null;
    }

    try {
      const content = await githubServiceRef.current!.fetchFileContent(
        prData.owner,
        prData.repo,
        path,
        prData.headSha
      );

      const lazyFile: LazyFile = {
        path,
        content,
        sha: node.sha,
        isReadOnly: true,
        fetchedAt: Date.now()
      };

      // Update lazy files map
      setLazyFiles(prev => new Map(prev).set(path, lazyFile));
      console.log(`[PRContext] Loaded ghost file: ${path}`);

      return lazyFile;
    } catch (e) {
      console.error(`[PRContext] Failed to load ghost file ${path}:`, e);
      return null;
    }
  }, [prData, lazyFiles, repoTree]);

  return (
    <PRContext.Provider value={{
      prData, setPRData: setPrData, selectedFile, selectFile, viewportState, updateViewport: (s) => setViewportState(v => ({ ...v, ...s })),
      selectionState, setSelectionState, walkthrough, loadWalkthrough: setWalkthrough, activeSectionId, setActiveSectionId,
      isDiffMode, setIsDiffMode, toggleDiffMode, focusedLocation, scrollToLine, navigateToCode, leftTab, setLeftTab, isCodeViewerReady, setIsCodeViewerReady,
      annotations, addAnnotation, removeAnnotation: (id) => setAnnotations(a => a.filter(x => x.id !== id)),
      updateAnnotation: (id, u) => setAnnotations(a => a.map(x => x.id === id ? { ...x, ...u } : x)),
      linearIssue, setLinearIssue, diagrams, activeDiagram, addDiagram: (d) => setDiagrams(p => [...p, d]),
      removeDiagram: (id) => { setDiagrams(p => p.filter(d => d.id !== id)); if (activeDiagram?.id === id) setActiveDiagram(null); },
      setActiveDiagram, diagramViewMode, setDiagramViewMode, diagramSplitPercent, setDiagramSplitPercent,
      setDiagrams, // Expose setter for full control (e.g. clearing)
      // Phase 9: Full Repo Context
      repoTree, lazyFiles, isFullRepoMode, isLoadingRepoTree, toggleFullRepoMode, loadGhostFile
    }}>
      {children}
    </PRContext.Provider>
  );
};

export const usePR = () => {
  const context = useContext(PRContext);
  if (!context) throw new Error('usePR must be used within a PRProvider');
  return context;
};
