import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough, SelectionState, Annotation, LinearIssue, Diagram } from '../types';

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
  
  // Navigation
  focusedLocation: FocusedLocation | null;
  scrollToLine: (file: string, line: number) => void;

  // Annotations
  annotations: Annotation[];
  addAnnotation: (file: string, line: number, type: 'marker' | 'label', text?: string) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;

  // Linear Integration
  linearIssue: LinearIssue | null;
  setLinearIssue: (issue: LinearIssue | null) => void;

  // Diagrams
  diagrams: Diagram[];
  activeDiagram: Diagram | null;
  addDiagram: (diagram: Diagram) => void;
  removeDiagram: (id: string) => void;
  setActiveDiagram: (diagram: Diagram | null) => void;
  diagramViewMode: 'full' | 'split';
  setDiagramViewMode: (mode: 'full' | 'split') => void;
}

const PRContext = createContext<PRContextType | undefined>(undefined);

export const PRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [prData, setPrData] = useState<PRData | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDiffMode, setIsDiffMode] = useState(true);
  
  const [viewportState, setViewportState] = useState<ViewportState>({
    file: null,
    startLine: 0,
    endLine: 0
  });

  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [linearIssue, setLinearIssue] = useState<LinearIssue | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<FocusedLocation | null>(null);
  
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagram, setActiveDiagram] = useState<Diagram | null>(null);
  const [diagramViewMode, setDiagramViewMode] = useState<'full' | 'split'>('full');

  // Select first file on load or when prData changes
  useEffect(() => {
    if (prData && prData.files.length > 0) {
      if (!selectedFile || !prData.files.find(f => f.path === selectedFile.path)) {
        setSelectedFile(prData.files[0]);
      }
      // Reset Diagrams on new PR
      setDiagrams([]);
      setActiveDiagram(null);
    } else {
        setSelectedFile(null);
    }
  }, [prData]);

  const updateViewport = (state: Partial<ViewportState>) => {
    setViewportState(prev => ({ ...prev, ...state }));
  };

  const selectFile = (file: FileChange) => {
    setSelectedFile(file);
    // Do NOT automatically deselect diagram if in split mode, but for now we keep behavior simple:
    // If they click a file, maybe they want to see it. 
    // But if we have split view, we want to keep diagram open.
    // Let's decide: selecting a file just updates the CodeViewer. 
    // We only clear activeDiagram if explicitly closed.
    // setActiveDiagram(null); <-- REMOVED this to allow file switching while diagram is open
    setViewportState({ file: file.path, startLine: 0, endLine: 0 });
    setSelectionState(null);
  };

  const scrollToLine = (file: string, line: number) => {
      if (prData) {
          const fileObj = prData.files.find(f => f.path === file);
          if (fileObj) {
              if (selectedFile?.path !== file) {
                  selectFile(fileObj);
              }
              setFocusedLocation({ file, line, timestamp: Date.now() });
          }
      }
  };

  const loadWalkthrough = (data: Walkthrough) => {
    setWalkthrough(data);
  };

  const toggleDiffMode = () => setIsDiffMode(prev => !prev);

  // Annotation Methods
  const addAnnotation = (file: string, line: number, type: 'marker' | 'label', text?: string) => {
      const id = `${type}_${Date.now()}`;
      // Auto-name markers if no text provided
      const defaultTitle = type === 'marker' ? `marker_${annotations.filter(a => a.type === 'marker').length + 1}` : 'New Label';
      
      const newAnnotation: Annotation = {
          id,
          file,
          line,
          type,
          title: type === 'marker' ? (text || defaultTitle) : (text || defaultTitle),
          description: type === 'label' ? '' : undefined,
          timestamp: Date.now()
      };
      
      setAnnotations(prev => {
          const next = [...prev, newAnnotation];
          return next;
      });
  };

  const removeAnnotation = (id: string) => {
      setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  // Diagram Methods
  const addDiagram = (diagram: Diagram) => {
      setDiagrams(prev => [...prev, diagram]);
  };

  const removeDiagram = (id: string) => {
      setDiagrams(prev => prev.filter(d => d.id !== id));
      if (activeDiagram?.id === id) setActiveDiagram(null);
  };

  const handleSetActiveDiagram = (diagram: Diagram | null) => {
      setActiveDiagram(diagram);
  };

  return (
    <PRContext.Provider value={{
      prData,
      setPRData: setPrData,
      selectedFile,
      selectFile,
      viewportState,
      updateViewport,
      selectionState,
      setSelectionState,
      walkthrough,
      loadWalkthrough,
      activeSectionId,
      setActiveSectionId,
      isDiffMode,
      toggleDiffMode,
      focusedLocation,
      scrollToLine,
      annotations,
      addAnnotation,
      removeAnnotation,
      updateAnnotation,
      linearIssue,
      setLinearIssue,
      diagrams,
      activeDiagram,
      addDiagram,
      removeDiagram,
      setActiveDiagram: handleSetActiveDiagram,
      diagramViewMode,
      setDiagramViewMode
    }}>
      {children}
    </PRContext.Provider>
  );
};

export const usePR = () => {
  const context = useContext(PRContext);
  if (context === undefined) {
    throw new Error('usePR must be used within a PRProvider');
  }
  return context;
};