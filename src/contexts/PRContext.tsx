/**
 * src/contexts/PRContext.tsx
 * The Presentation Layer.
 * Now delegates data fetching to useNavigationModule().
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback, useMemo } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough, SelectionState, Annotation, LinearIssue, Diagram, NavigationTarget, Note, AppMode } from '../types/domain';
import { resolveFilePath } from '../utils/fileUtils';
// NEW IMPORTS
import { useNavigationModule } from '../modules/navigation/hooks';
import { canFetchRemote } from '../modules/ingestion/PRSourceService';
import { RepoNode, LazyFile } from '../modules/navigation/types';
import { waitForLine, findNearestLine } from '../modules/navigation/lineRegistry';
import type { VerificationState } from '../types/review';
import { storageService } from '../modules/persistence';
import { parseSessionText } from '../lib/session-parser/index';
import { scoreFiles } from '../lib/risk-scoring/index';
import type { FileRiskScore } from '../lib/risk-scoring/index';
import { generateReport, renderReportMarkdown } from '../lib/report/index';
import { extractRequirements } from '../lib/requirements/index';
import type { Requirement } from '../types/review';
import { downloadBlob } from '../utils/downloadUtils';

// Phase 9: Unify Selection Type
export type SelectedFile = FileChange | LazyFile;

interface FocusedLocation {
  file: string;
  line: number;
  timestamp: number;
  side?: 'old' | 'new';
}

interface PRContextType {
  prData: PRData | null;
  setPRData: (data: PRData | null) => void;
  selectedFile: SelectedFile | null;
  selectFile: (file: SelectedFile) => void;
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
  isFlashActive: boolean;
  scrollToLine: (file: string, line: number, side?: 'old' | 'new') => void;
  navigateToCode: (target: NavigationTarget) => Promise<boolean>;
  setLeftTab: (tab: 'files' | 'annotations' | 'issue' | 'diagrams' | 'terminal' | 'notes') => void;
  leftTab: 'files' | 'annotations' | 'issue' | 'diagrams' | 'terminal' | 'notes';
  annotations: Annotation[];
  addAnnotation: (file: string, line: number, type: 'marker' | 'label', text?: string, side?: 'old' | 'new') => void;
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

  // Review-intent mode: shapes what the AI focuses on (see src/prompts/modeInstructions.ts)
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  customReviewGoal: string;
  setCustomReviewGoal: (goal: string) => void;

  // Phase 9: Delegated to Navigation Module
  repoTree: RepoNode[];
  lazyFiles: Map<string, LazyFile>;
  isFullRepoMode: boolean;
  isLoadingRepoTree: boolean;
  toggleFullRepoMode: () => Promise<void>;
  loadGhostFile: (path: string) => Promise<LazyFile | null>;

  // F1: Review Map — per-file verification states
  fileVerificationStates: Map<string, VerificationState>;
  setFileVerificationState: (path: string, state: VerificationState) => void;

  // I1+I3: Session parser risk scoring
  fileRiskScores: Map<string, FileRiskScore>;
  loadSessionFile: (file: File) => Promise<void>;
  hasSession: boolean;

  // I2: Extracted requirements from session prompts
  sessionRequirements: Requirement[];

  // F3: Review Report
  exportReviewReport: () => void;

  // F5: Whiteboard notes
  notes: Note[];
  addNote: (text: string) => string;
  updateNote: (id: string, text: string) => void;
  removeNote: (id: string) => void;
}

const PRContext = createContext<PRContextType | undefined>(undefined);

export const PRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [prData, setPrData] = useState<PRData | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDiffMode, setIsDiffMode] = useState(true);
  const [leftTab, setLeftTab] = useState<'files' | 'annotations' | 'issue' | 'diagrams' | 'terminal' | 'notes'>('files');
  const [viewportState, setViewportState] = useState<ViewportState>({ file: null, startLine: 0, endLine: 0 });
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<FocusedLocation | null>(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [linearIssue, setLinearIssue] = useState<LinearIssue | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagram, setActiveDiagram] = useState<Diagram | null>(null);
  const [diagramViewMode, setDiagramViewMode] = useState<'full' | 'split'>('full');
  const [diagramSplitPercent, setDiagramSplitPercent] = useState(50);

  // Review-intent mode
  const [appMode, setAppMode] = useState<AppMode>('pr');
  const [customReviewGoal, setCustomReviewGoal] = useState<string>('');

  // F1+F4: Review Map — per-file verification states, persisted per PR
  const [fileVerificationStates, setFileVerificationStates] = useState<Map<string, VerificationState>>(new Map());
  const isLoadingStatesRef = useRef(false);

  // F4: Load saved review state when a new PR is opened
  useEffect(() => {
    if (prData?.id) {
      isLoadingStatesRef.current = true;
      setFileVerificationStates(storageService.loadReviewState(prData.id));
    } else {
      setFileVerificationStates(new Map());
    }
  }, [prData?.id]);

  // F4: Persist review state whenever it changes (no size guard — must persist empty state too)
  useEffect(() => {
    if (prData?.id) {
      if (isLoadingStatesRef.current) { isLoadingStatesRef.current = false; return; }
      storageService.saveReviewState(prData.id, fileVerificationStates);
    }
  }, [prData?.id, fileVerificationStates]);

  const setFileVerificationState = useCallback((path: string, state: VerificationState) => {
    setFileVerificationStates(prev => new Map(prev).set(path, state));
  }, []);

  // Diagrams — persisted per PR (mirrors fileVerificationStates pattern)
  const isLoadingDiagramsRef = useRef(false);

  // Load saved diagrams when a new PR is opened
  useEffect(() => {
    if (prData?.id) {
      isLoadingDiagramsRef.current = true;
      const loaded = storageService.loadDiagrams(prData.id);
      setDiagrams(loaded);
      // Restore the most recent diagram as active, if any
      setActiveDiagram(loaded.length > 0 ? loaded[loaded.length - 1] : null);
    } else {
      setDiagrams([]);
      setActiveDiagram(null);
    }
  }, [prData?.id]);

  // Persist diagrams whenever they change (no size guard — empty state must persist too)
  useEffect(() => {
    if (prData?.id) {
      if (isLoadingDiagramsRef.current) { isLoadingDiagramsRef.current = false; return; }
      storageService.saveDiagrams(prData.id, diagrams);
    }
  }, [prData?.id, diagrams]);

  // I1+I3: Session file risk scores
  const [fileRiskScores, setFileRiskScores] = useState<Map<string, FileRiskScore>>(new Map());
  const [hasSession, setHasSession] = useState(false);
  // I2: Requirements extracted from session prompts
  const [sessionRequirements, setSessionRequirements] = useState<Requirement[]>([]);

  const loadSessionFile = useCallback(async (file: File) => {
    const text = await file.text();
    const session = parseSessionText(text, file.name);
    const filePaths = prData?.files.map(f => f.path) ?? [];

    // I3: Risk scores
    const riskReport = scoreFiles(session, filePaths);
    setFileRiskScores(new Map(riskReport.files.map(s => [s.filePath, s])));

    // I2: Extract requirements from prompts
    const { requirements } = extractRequirements(session);
    setSessionRequirements(requirements.map(r => ({
      ...r,
      codeSections: [],
      verificationState: 'unreviewed' as const,
    })));

    setHasSession(true);
  }, [prData?.files]);

  // F5: Whiteboard notes — persisted per PR
  const [notes, setNotes] = useState<Note[]>([]);
  const isLoadingNotesRef = useRef(false);

  useEffect(() => {
    if (prData?.id) {
      isLoadingNotesRef.current = true;
      setNotes(storageService.loadNotes(prData.id));
    } else {
      setNotes([]);
    }
  }, [prData?.id]);

  useEffect(() => {
    if (prData?.id) {
      if (isLoadingNotesRef.current) { isLoadingNotesRef.current = false; return; }
      storageService.saveNotes(prData.id, notes);
    }
  }, [prData?.id, notes]);

  const addNote = useCallback((text: string): string => {
    const id = `note-${Date.now()}`;
    setNotes(prev => [...prev, { id, text, timestamp: Date.now() }]);
    return id;
  }, []);

  const updateNote = useCallback((id: string, text: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  // F3: Export review report as markdown download
  const exportReviewReport = useCallback(() => {
    if (!prData) return;
    const report = generateReport({ prData, fileVerificationStates, annotations });
    const markdown = renderReportMarkdown(report, { prData, fileVerificationStates, annotations });
    downloadBlob(new Blob([markdown], { type: 'text/markdown' }), `review-${prData.id}-${new Date().toISOString().slice(0, 10)}.md`);
  }, [prData, fileVerificationStates, annotations]);

  // NEW: Hook into the Navigation Module
  const navModule = useNavigationModule();

  const [isNavigating, setIsNavigating] = useState(false);

  // Single highlight owner: one timer, driven off focusedLocation, consumed by
  // both DiffView and SourceView instead of each keeping its own flash timer.
  useEffect(() => {
    if (!focusedLocation) return;
    setIsFlashActive(true);
    const timer = setTimeout(() => setIsFlashActive(false), 1500);
    return () => clearTimeout(timer);
  }, [focusedLocation]);

  // Expose PR State for test verification (Phase 10.4 Smoke Test Hook)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__THEIA_PR_STATE__ = {
        isDiffMode,
        leftTab,
        selectedFile: selectedFile?.path || null
      };
    }
  }, [isDiffMode, leftTab, selectedFile]);

  // FR-043: Auto-trigger Full Repo Mode when in Repo Mode (no PR files)
  useEffect(() => {
    if (prData && prData.files.length === 0 && canFetchRemote(prData) && prData.owner && prData.repo && prData.headSha) {
      console.log('[PRContext] Repo Mode detected - auto-enabling Full Repo Mode');
      navModule.service.toggleFullRepoMode(prData.owner, prData.repo, prData.headSha);
    }
  }, [prData, navModule.service]);

  const selectFile = useCallback((file: SelectedFile) => {
    setSelectedFile(file);
    setViewportState({ file: file.path, startLine: 0, endLine: 0 });
    setSelectionState(null);
  }, []);

  const navigateToCode = useCallback(async (target: NavigationTarget): Promise<boolean> => {
    if (!prData || isNavigating) return false;

    try {
      setIsNavigating(true);

      // Tab Management
      // We can't easily check "leftTab" state inside callback without adding it towards deps
      // triggering re-renders. We'll rely on the functional update or ref if needed.
      // For now, we will add leftTab to deps as it is a UI state that changes rarely compared to mouse moves.
      if (leftTab !== 'files' && target.source !== 'tree') {
        setLeftTab('files');
        await new Promise(r => setTimeout(r, 0));
      }

      // Resolve Path
      const resolution = resolveFilePath(target.filepath, prData.files.map(f => f.path));
      // NOTE: If resolution fails in PR files, we should still try strictly if we have a full repo mode
      const resolvedPath = resolution.resolved || target.filepath;

      // 1. Try PR Files (Hot)
      let fileToSelect: SelectedFile | undefined = prData.files.find(f => f.path === resolvedPath);

      // 2. Try Ghost Files (Warm/Cold)
      if (!fileToSelect) {
        // Check if we have it in Lazy Files
        const lazyFile = navModule.lazyFiles.get(resolvedPath);
        if (lazyFile) {
          fileToSelect = lazyFile;
        } else if (canFetchRemote(prData) && prData.owner && prData.repo && prData.headSha) {
          // Attempt Fetch
          console.log(`[PRContext] Attempting to load Ghost File: ${resolvedPath}`);
          const fetched = await navModule.service.loadGhostFile(prData.owner, prData.repo, resolvedPath, prData.headSha);
          if (fetched) {
            fileToSelect = fetched;
          }
        }
      }

      if (!fileToSelect) {
        console.warn(`[PRContext] Navigation failed: File not found in PR or Repo: ${resolvedPath}`);
        return false;
      }

      // Switch File
      if (selectedFile?.path !== fileToSelect.path) {
        selectFile(fileToSelect); // Recurse to our now-memoized selectFile
      }

      // Wait for the view to register the target line (resolves immediately
      // if already mounted, or the moment DiffView/SourceView registers it —
      // no polling).
      const side = target.side ?? 'new';
      const el = await waitForLine(fileToSelect.path, target.line, 3000, side);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFocusedLocation({ file: fileToSelect.path, line: target.line, timestamp: Date.now(), side });
        return true;
      }

      // Fail-open: waitForLine timed out — markdown-preview files (zero
      // registered lines), past-EOF targets, and other unregistered cases
      // must never leave navigation a silent no-op. Try the nearest
      // registered line on the same file/side first; if nothing is
      // registered at all, still land on the file and scroll to top.
      console.warn(`[PRContext] Navigation timed out waiting for ${fileToSelect.path}:${target.line}, falling back`);
      const nearestLine = findNearestLine(fileToSelect.path, side, target.line);
      if (nearestLine !== null) {
        const nearestEl = await waitForLine(fileToSelect.path, nearestLine, 100, side);
        if (nearestEl) {
          nearestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setFocusedLocation({ file: fileToSelect.path, line: nearestLine, timestamp: Date.now(), side });
          return true;
        }
      }

      const scrollContainer = document.querySelector('[data-testid="code-viewer-scroll-container"]');
      if (scrollContainer) scrollContainer.scrollTop = 0;
      setFocusedLocation({ file: fileToSelect.path, line: target.line, timestamp: Date.now(), side });
      return true;
    } catch (e) {
      console.error("Navigation error", e);
      return false;
    } finally {
      setIsNavigating(false);
    }
  }, [prData, isNavigating, leftTab, selectedFile, navModule.lazyFiles, navModule.service, selectFile]);

  const scrollToLine = useCallback((file: string, line: number, side?: 'old' | 'new') => {
    navigateToCode({ filepath: file, line, source: 'annotation', side });
  }, [navigateToCode]);

  const toggleDiffMode = useCallback(() => setIsDiffMode(prev => !prev), []);

  const addAnnotation = useCallback((file: string, line: number, type: 'marker' | 'label', text?: string, side?: 'old' | 'new') => {
    const id = `${type}_${Date.now()}`;
    setAnnotations(prev => {
      const title = text || (type === 'marker' ? `marker_${prev.length + 1}` : 'New Label');
      return [...prev, { id, file, line, side: side ?? 'new', type, title, timestamp: Date.now() }];
    });
  }, []);

  // --- DELEGATED METHODS ---

  const toggleFullRepoMode = useCallback(async () => {
    if (!canFetchRemote(prData) || !prData?.owner || !prData?.repo || !prData?.headSha) {
      console.warn('[PRContext] Missing PR metadata for full repo mode');
      return;
    }
    await navModule.service.toggleFullRepoMode(prData.owner, prData.repo, prData.headSha);
  }, [prData, navModule.service]);

  const loadGhostFile = useCallback(async (path: string): Promise<LazyFile | null> => {
    // 1. Check local PR files (Hot)
    if (prData?.files.find(f => f.path === path)) {
      return null;
    }

    if (!canFetchRemote(prData) || !prData?.owner || !prData?.repo || !prData?.headSha) {
      return null;
    }

    // 2. Delegate to Module (Warm/Ghost)
    return navModule.service.loadGhostFile(prData.owner, prData.repo, path, prData.headSha);
  }, [prData, navModule.service]);

  const contextValue = useMemo<PRContextType>(() => ({
    prData, setPRData: setPrData, selectedFile, selectFile, viewportState, updateViewport: (s) => setViewportState(v => ({ ...v, ...s })),
    selectionState, setSelectionState, walkthrough, loadWalkthrough: setWalkthrough, activeSectionId, setActiveSectionId,
    isDiffMode, setIsDiffMode, toggleDiffMode, focusedLocation, isFlashActive, scrollToLine, navigateToCode, leftTab, setLeftTab,
    annotations, addAnnotation, removeAnnotation: (id) => setAnnotations(a => a.filter(x => x.id !== id)),
    updateAnnotation: (id, u) => setAnnotations(a => a.map(x => x.id === id ? { ...x, ...u } : x)),
    linearIssue, setLinearIssue, diagrams, activeDiagram, addDiagram: (d) => setDiagrams(p => [...p, d]),
    removeDiagram: (id) => { setDiagrams(p => p.filter(d => d.id !== id)); if (activeDiagram?.id === id) setActiveDiagram(null); },
    setActiveDiagram, diagramViewMode, setDiagramViewMode, diagramSplitPercent, setDiagramSplitPercent,
    setDiagrams,
    appMode, setAppMode, customReviewGoal, setCustomReviewGoal,
    // Mapped Module State
    repoTree: navModule.repoTree,
    lazyFiles: navModule.lazyFiles,
    isFullRepoMode: navModule.isFullRepoMode,
    isLoadingRepoTree: navModule.isLoadingRepoTree,
    toggleFullRepoMode,
    loadGhostFile,
    // F1: Review Map
    fileVerificationStates,
    setFileVerificationState,
    // I1+I3: Risk scoring
    fileRiskScores,
    loadSessionFile,
    hasSession,
    // I2: Requirements
    sessionRequirements,
    // F3: Report
    exportReviewReport,
    // F5: Whiteboard
    notes, addNote, updateNote, removeNote,
  }), [
    prData, selectedFile, selectFile, viewportState,
    selectionState, walkthrough, activeSectionId,
    isDiffMode, toggleDiffMode, focusedLocation, isFlashActive, scrollToLine, navigateToCode, leftTab,
    annotations, addAnnotation,
    linearIssue, diagrams, activeDiagram,
    diagramViewMode, diagramSplitPercent,
    appMode, customReviewGoal,
    navModule.repoTree, navModule.lazyFiles, navModule.isFullRepoMode, navModule.isLoadingRepoTree,
    toggleFullRepoMode, loadGhostFile,
    fileVerificationStates, setFileVerificationState,
    fileRiskScores, loadSessionFile, hasSession,
    sessionRequirements,
    exportReviewReport,
    notes, addNote, updateNote, removeNote,
  ]);

  return (
    <PRContext.Provider value={contextValue}>
      {children}
    </PRContext.Provider>
  );
};

export const usePR = () => {
  const context = useContext(PRContext);
  if (!context) throw new Error('usePR must be used within a PRProvider');
  return context;
};
