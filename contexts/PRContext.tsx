import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough, SelectionState, Annotation, LinearIssue } from '../types';

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

  // Select first file on load or when prData changes
  useEffect(() => {
    if (prData && prData.files.length > 0) {
      if (!selectedFile || !prData.files.find(f => f.path === selectedFile.path)) {
        setSelectedFile(prData.files[0]);
      }
    } else {
        setSelectedFile(null);
    }
  }, [prData]);

  const updateViewport = (state: Partial<ViewportState>) => {
    setViewportState(prev => ({ ...prev, ...state }));
  };

  const selectFile = (file: FileChange) => {
    setSelectedFile(file);
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
      setLinearIssue
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