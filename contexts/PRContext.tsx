
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough, SelectionState, Annotation, LinearIssue, Diagram, NavigationTarget } from '../types';
import { arePathsEquivalent, resolveFilePath } from '../utils/fileUtils';

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
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [linearIssue, setLinearIssue] = useState<LinearIssue | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<FocusedLocation | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagram, setActiveDiagram] = useState<Diagram | null>(null);
  const [diagramViewMode, setDiagramViewMode] = useState<'full' | 'split'>('split');
  const [diagramSplitPercent, setDiagramSplitPercent] = useState(50);

  const isCodeViewerReadyRef = useRef(false);
  useEffect(() => { isCodeViewerReadyRef.current = isCodeViewerReady; }, [isCodeViewerReady]);

  useEffect(() => {
    if (prData?.id) {
      const saved = localStorage.getItem(`vcr_annotations_${prData.id}`);
      if (saved) setAnnotations(JSON.parse(saved));
      else setAnnotations([]);
    }
  }, [prData?.id]);

  useEffect(() => {
    if (prData?.id) localStorage.setItem(`vcr_annotations_${prData.id}`, JSON.stringify(annotations));
  }, [annotations, prData?.id]);

  useEffect(() => {
    if (prData && prData.files.length > 0 && !selectedFile) setSelectedFile(prData.files[0]);
  }, [prData]);

  const selectFile = (file: FileChange) => {
    setSelectedFile(file);
    setViewportState({ file: file.path, startLine: 0, endLine: 0 });
    setSelectionState(null);
  };

  const navigateToCode = async (target: NavigationTarget): Promise<boolean> => {
    if (!prData) return false;
    const resolution = resolveFilePath(target.filepath, prData.files.map(f => f.path));
    if (!resolution.resolved) return false;

    const fileToSelect = prData.files.find(f => f.path === resolution.resolved);
    if (!fileToSelect) return false;

    if (selectedFile?.path !== fileToSelect.path) {
        setIsCodeViewerReady(false);
        selectFile(fileToSelect);
        let attempts = 0;
        while (!isCodeViewerReadyRef.current && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
    }

    setFocusedLocation({ file: fileToSelect.path, line: target.line, timestamp: Date.now() });
    if (leftTab !== 'files') setLeftTab('files');
    return true;
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

  return (
    <PRContext.Provider value={{
      prData, setPRData: setPrData, selectedFile, selectFile, viewportState, updateViewport: (s) => setViewportState(v => ({...v, ...s})),
      selectionState, setSelectionState, walkthrough, loadWalkthrough: setWalkthrough, activeSectionId, setActiveSectionId,
      isDiffMode, toggleDiffMode, focusedLocation, scrollToLine, navigateToCode, leftTab, setLeftTab, isCodeViewerReady, setIsCodeViewerReady,
      annotations, addAnnotation, removeAnnotation: (id) => setAnnotations(a => a.filter(x => x.id !== id)),
      updateAnnotation: (id, u) => setAnnotations(a => a.map(x => x.id === id ? {...x, ...u} : x)),
      linearIssue, setLinearIssue, diagrams, activeDiagram, addDiagram: (d) => setDiagrams(p => [...p, d]),
      removeDiagram: (id) => { setDiagrams(p => p.filter(d => d.id !== id)); if(activeDiagram?.id === id) setActiveDiagram(null); },
      setActiveDiagram, diagramViewMode, setDiagramViewMode, diagramSplitPercent, setDiagramSplitPercent
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
