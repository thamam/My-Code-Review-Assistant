import React, { useState, useEffect, useCallback } from 'react';
import { PRProvider, usePR } from './contexts/PRContext';
import { ChatProvider, useChat } from './contexts/ChatContext';
import { LiveProvider, useLive } from './contexts/LiveContext';
import { FileTree } from './components/FileTree/FileTree';
import { CodeViewer } from './components/CodeViewer/CodeViewer';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { WalkthroughPanel } from './components/Walkthrough/WalkthroughPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AnnotationList } from './components/Annotations/AnnotationList';
import { LinearModal } from './components/LinearModal';
import { LinearPanel } from './components/LinearPanel';
import { GitPullRequest, Layout, MessageSquare, ArrowLeft, Mic, Loader2, BookMarked, FolderTree, Play, RotateCcw, Link, Pause, FileUp, Target } from 'lucide-react';
import clsx from 'clsx';
import { Walkthrough, WalkthroughSection } from './types';

const VoiceControls = () => {
    const { isActive, isConnecting, connect, disconnect, error, volume, sendText } = useLive();
    const { resetChat } = useChat();
    const [confirmReset, setConfirmReset] = useState(false);

    useEffect(() => {
        if (confirmReset) {
            const timer = setTimeout(() => setConfirmReset(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmReset]);

    const handleReset = () => {
        if (!confirmReset) {
            setConfirmReset(true);
            return;
        }
        disconnect();
        resetChat();
        setConfirmReset(false);
    };
    
    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-400 hidden sm:inline">{error}</span>}
            
            <button
                onClick={handleReset}
                className={clsx(
                    "flex items-center gap-1 px-2 py-1.5 rounded transition-all border",
                    confirmReset 
                        ? "bg-red-900 border-red-500 text-white animate-pulse" 
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                )}
                title={confirmReset ? "Click again to confirm reset" : "Reset Chat History"}
            >
                <RotateCcw size={14} />
                {confirmReset && <span className="text-[10px] font-bold">Confirm</span>}
            </button>

            {isActive && (
                <button
                    onClick={() => sendText("Hello? Are you there?")}
                    className="px-2 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 text-purple-400 rounded hover:bg-gray-700 hover:text-purple-300 transition-colors flex items-center gap-1"
                    title="Test Greeting (Force Model to Speak)"
                >
                    <Play size={12} fill="currentColor" /> Test
                </button>
            )}

            <button
                onClick={isActive ? disconnect : connect}
                disabled={isConnecting}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded transition-all relative overflow-hidden",
                    isActive 
                        ? "bg-red-900/30 border-red-500/50 text-red-200 hover:bg-red-900/50" 
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                )}
                title={isActive ? "Pause Context (Stop Voice)" : "Start Voice Chat"}
            >
                {/* Volume Visualizer Background */}
                {isActive && (
                    <div 
                        className="absolute inset-0 bg-red-500/20 transition-transform duration-75 ease-out origin-left pointer-events-none"
                        style={{ transform: `scaleX(${0.1 + volume})` }}
                    />
                )}

                {isConnecting ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : isActive ? (
                    <>
                        <div className="relative">
                            <Pause size={16} className="text-red-400 relative z-10" />
                        </div>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        <span className="hidden sm:inline relative z-10 font-bold">Live</span>
                    </>
                ) : (
                    <>
                        <Mic size={16} />
                        <span className="hidden sm:inline">Voice</span>
                    </>
                )}
            </button>
        </div>
    );
};

const MainLayout = () => {
  const { prData, setPRData, walkthrough, loadWalkthrough, viewportState, isDiffMode, toggleDiffMode, linearIssue } = usePR();
  const [showChat, setShowChat] = useState(true);
  const [showTree, setShowTree] = useState(true);
  const [showLinearModal, setShowLinearModal] = useState(false);
  
  // Left Sidebar Tab State
  const [leftTab, setLeftTab] = useState<'files' | 'annotations' | 'issue'>('files');
  
  // Resizable Panel States
  const [chatWidth, setChatWidth] = useState(350);
  const [fileTreeWidth, setFileTreeWidth] = useState(280);
  
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [isResizingTree, setIsResizingTree] = useState(false);

  const startResizingChat = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingChat(true);
  }, []);

  const startResizingTree = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTree(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizingChat(false);
    setIsResizingTree(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingChat) {
        const newWidth = document.body.clientWidth - e.clientX;
        if (newWidth > 250 && newWidth < document.body.clientWidth * 0.6) {
            setChatWidth(newWidth);
        }
    }
    if (isResizingTree) {
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < document.body.clientWidth * 0.4) {
            setFileTreeWidth(newWidth);
        }
    }
  }, [isResizingChat, isResizingTree]);

  useEffect(() => {
    if (isResizingChat || isResizingTree) {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
    }
    return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingChat, isResizingTree, resize, stopResizing]);

  // Logic duplicated from WelcomeScreen for robustness in this PoC without a dedicated util file refactor
  const handleWalkthroughUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          try {
              if (file.name.endsWith('.json')) {
                  loadWalkthrough(JSON.parse(content));
              } else {
                  // Basic Markdown Parse
                   const lines = content.split('\n');
                   let title = "Walkthrough";
                   let author = "Anonymous";
                   const sections: WalkthroughSection[] = [];
                   let currentSection: any = null;

                   for (let line of lines) {
                       line = line.trim();
                       if (!line) continue;
                       if (line.startsWith('# ')) title = line.substring(2).trim();
                       else if (line.toLowerCase().startsWith('author:')) author = line.substring(7).trim();
                       else if (line.startsWith('## ')) {
                           if (currentSection) sections.push(currentSection);
                           currentSection = { id: `sec-${sections.length + 1}`, title: line.substring(3).trim(), files: [], description: '', highlights: [] };
                       } else if (currentSection) {
                           if (line.toLowerCase().startsWith('files:')) currentSection.files = line.substring(6).split(',').map((f:string) => f.trim());
                           else if (line.startsWith('- ') && line.includes(':')) {
                               const firstColon = line.indexOf(':');
                               if (firstColon > -1) {
                                   const file = line.substring(2, firstColon).trim();
                                   const rest = line.substring(firstColon + 1).trim();
                                   const secondColon = rest.indexOf(':');
                                   if (secondColon > -1) {
                                       const range = rest.substring(0, secondColon).trim();
                                       const note = rest.substring(secondColon + 1).trim();
                                       let start = 0, end = 0;
                                       if (range.includes('-')) { const parts = range.split('-'); start = parseInt(parts[0]); end = parseInt(parts[1]); } 
                                       else { start = parseInt(range); end = start; }
                                       if (!isNaN(start)) {
                                           currentSection.highlights.push({ file, lines: [start, end], note });
                                           if (!currentSection.files.includes(file)) currentSection.files.push(file);
                                       } else currentSection.description += line + '\n';
                                   } else currentSection.description += line + '\n';
                               } else currentSection.description += line + '\n';
                           } else currentSection.description += line + '\n';
                       }
                   }
                   if (currentSection) sections.push(currentSection);
                   loadWalkthrough({ title, author, sections });
              }
          } catch (err) {
              console.error("Failed to parse walkthrough", err);
              alert("Invalid file format");
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
  };


  if (!prData) {
    return <WelcomeScreen />;
  }

  return (
    <div className={clsx("flex flex-col h-screen bg-gray-950 text-white font-sans", (isResizingChat || isResizingTree) && "cursor-col-resize select-none")}>
      <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button 
             onClick={() => setPRData(null as any)}
             className="text-gray-500 hover:text-white transition-colors shrink-0"
             title="Back to Welcome Screen"
          >
             <ArrowLeft size={20} />
          </button>
          <GitPullRequest className="text-blue-500 shrink-0" />
          <div className="overflow-hidden min-w-0">
            <h1 className="text-sm font-bold flex items-center gap-2 truncate">
              {prData.title}
              <span className="text-xs font-normal text-gray-500 px-2 py-0.5 border border-gray-700 rounded-full">#{prData.id}</span>
              {linearIssue && (
                  <button 
                    onClick={() => {
                        setShowTree(true);
                        setLeftTab('issue');
                    }}
                    className="flex items-center gap-1 text-[10px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800 hover:bg-blue-900/50"
                  >
                    <Link size={10} />
                    {linearIssue.identifier}
                  </button>
              )}
            </h1>
            <p className="text-xs text-gray-500 truncate">
                by {prData.author} • {prData.headRef} ➝ {prData.baseRef}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
           {/* Walkthrough Uploader */}
           <label className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-white hover:bg-gray-700 cursor-pointer hidden md:flex">
               <FileUp size={14} />
               <span className="hidden lg:inline">Load Walkthrough</span>
               <input type="file" accept=".json, .md" className="hidden" onChange={handleWalkthroughUpload} />
           </label>

           {!linearIssue && (
               <button 
                  onClick={() => setShowLinearModal(true)}
                  className="hidden md:flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-white hover:bg-gray-700"
               >
                   <Link size={12} />
                   Link Issue
               </button>
           )}

           <VoiceControls />
           
           <div className="h-6 w-px bg-gray-700 mx-1" />

           <button 
             onClick={toggleDiffMode}
             className="px-3 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition-colors hidden sm:block"
           >
             {isDiffMode ? "Show Raw" : "Show Diff"}
           </button>
           
           <div className="h-6 w-px bg-gray-700 mx-1 hidden sm:block" />
           <button onClick={() => setShowTree(!showTree)} className={clsx("p-2 rounded hover:bg-gray-800", !showTree && "text-gray-500")}>
               <Layout size={18} />
           </button>
           <button onClick={() => setShowChat(!showChat)} className={clsx("p-2 rounded hover:bg-gray-800", !showChat && "text-gray-500")}>
               <MessageSquare size={18} />
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: File Tree / Annotations / Linear */}
        {showTree && (
            <div className="flex shrink-0 h-full relative flex-col bg-gray-900 border-r border-gray-800" style={{ width: fileTreeWidth }}>
                <div className="flex border-b border-gray-800 bg-gray-900">
                    <button 
                        onClick={() => setLeftTab('files')}
                        className={clsx("flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-colors", leftTab === 'files' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300")}
                        title="Files"
                    >
                        <FolderTree size={14} />
                    </button>
                    <button 
                        onClick={() => setLeftTab('annotations')}
                        className={clsx("flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-colors", leftTab === 'annotations' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300")}
                        title="Annotations"
                    >
                        <BookMarked size={14} />
                    </button>
                    <button 
                        onClick={() => setLeftTab('issue')}
                        className={clsx("flex-1 py-2 text-xs font-medium flex items-center justify-center gap-2 transition-colors", leftTab === 'issue' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300")}
                        title="Linear Issue"
                    >
                        <Target size={14} />
                    </button>
                </div>
                
                <div className="w-full flex-1 overflow-hidden">
                    {leftTab === 'files' && <FileTree />}
                    {leftTab === 'annotations' && <AnnotationList />}
                    {leftTab === 'issue' && <LinearPanel onLinkClick={() => setShowLinearModal(true)} />}
                </div>

                <div 
                    onMouseDown={startResizingTree}
                    className="absolute right-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-30 transition-colors flex items-center justify-center group"
                >
                     <div className="h-8 w-1 bg-gray-600 rounded-full opacity-0 group-hover:opacity-100" />
                </div>
            </div>
        )}

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-950 border-r border-gray-800">
            {walkthrough && <WalkthroughPanel />}
            <div className="flex-1 overflow-hidden relative">
                <CodeViewer />
                <div className="absolute bottom-4 right-8 bg-gray-900/90 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 shadow-xl backdrop-blur-sm pointer-events-none transition-opacity duration-500 z-20">
                    {viewportState.file ? (
                        <span>
                            Viewing <span className="text-blue-400">{viewportState.file}</span> 
                            {viewportState.startLine > 0 && ` : lines ${viewportState.startLine}-${viewportState.endLine}`}
                        </span>
                    ) : (
                        "No file selected"
                    )}
                </div>
            </div>
        </div>

        {/* Chat */}
        {showChat && (
             <div className="flex shrink-0 h-full relative" style={{ width: chatWidth }}>
                <div 
                    onMouseDown={startResizingChat}
                    className="absolute left-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-30 transition-colors flex items-center justify-center group"
                >
                     <div className="h-8 w-1 bg-gray-600 rounded-full opacity-0 group-hover:opacity-100" />
                </div>
                
                <div className="w-full h-full overflow-hidden">
                    <ChatPanel />
                </div>
             </div>
        )}
      </div>

      <LinearModal isOpen={showLinearModal} onClose={() => setShowLinearModal(false)} />
    </div>
  );
};

const App = () => (
  <PRProvider>
    <ChatProvider>
      <LiveProvider>
        <MainLayout />
      </LiveProvider>
    </ChatProvider>
  </PRProvider>
);

export default App;