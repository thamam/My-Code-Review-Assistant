import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { PRData, FileChange, ViewportState, Walkthrough } from '../types';
// SAMPLE_PR is no longer default but available for manual load

interface PRContextType {
  prData: PRData | null;
  setPRData: (data: PRData) => void;
  selectedFile: FileChange | null;
  selectFile: (file: FileChange) => void;
  viewportState: ViewportState;
  updateViewport: (state: Partial<ViewportState>) => void;
  walkthrough: Walkthrough | null;
  loadWalkthrough: (data: Walkthrough) => void;
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
  isDiffMode: boolean;
  toggleDiffMode: () => void;
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

  // Select first file on load or when prData changes
  useEffect(() => {
    if (prData && prData.files.length > 0) {
      // If no file is selected, or the selected file is not in the new PR, select the first one
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
    // Reset viewport when file changes
    setViewportState({ file: file.path, startLine: 0, endLine: 0 });
  };

  const loadWalkthrough = (data: Walkthrough) => {
    setWalkthrough(data);
    if (data.sections.length > 0) {
        // Optional: Auto-select first section?
    }
  };

  const toggleDiffMode = () => setIsDiffMode(prev => !prev);

  return (
    <PRContext.Provider value={{
      prData,
      setPRData: setPrData,
      selectedFile,
      selectFile,
      viewportState,
      updateViewport,
      walkthrough,
      loadWalkthrough,
      activeSectionId,
      setActiveSectionId,
      isDiffMode,
      toggleDiffMode
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