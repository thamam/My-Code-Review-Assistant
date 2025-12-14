import React, { useState, useEffect, useCallback } from 'react';
import { PRProvider, usePR } from './contexts/PRContext';
import { ChatProvider } from './contexts/ChatContext';
import { LiveProvider, useLive } from './contexts/LiveContext';
import { FileTree } from './components/FileTree/FileTree';
import { CodeViewer } from './components/CodeViewer/CodeViewer';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { WalkthroughPanel } from './components/Walkthrough/WalkthroughPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { GitPullRequest, Layout, MessageSquare, ArrowLeft, GripVertical, Mic, MicOff, Radio, Loader2, StopCircle } from 'lucide-react';
import clsx from 'clsx';

const VoiceControls = () => {
    const { isActive, isConnecting, connect, disconnect, error, volume } = useLive();
    
    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-400 hidden sm:inline">{error}</span>}
            <button
                onClick={isActive ? disconnect : connect}
                disabled={isConnecting}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded transition-all relative overflow-hidden",
                    isActive 
                        ? "bg-red-900/30 border-red-500/50 text-red-200 hover:bg-red-900/50" 
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                )}
                title={isActive ? "Stop Voice Chat" : "Start Voice Chat"}
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
                            <Mic size={16} className="text-red-400 relative z-10" />
                            {/* Glow Ring */}
                            <div 
                                className="absolute inset-0 rounded-full bg-red-500 opacity-50 z-0 transition-transform duration-75"
                                style={{ transform: `scale(${1 + volume * 1.5})` }}
                            />
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
  const { prData, setPRData, walkthrough, viewportState, isDiffMode, toggleDiffMode } = usePR();
  const [showChat, setShowChat] = useState(true);
  const [showTree, setShowTree] = useState(true);
  
  // Resizable Chat Panel State
  const [chatWidth, setChatWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
        const newWidth = document.body.clientWidth - e.clientX;
        // Limit width between 250px and 50% of screen
        if (newWidth > 250 && newWidth < document.body.clientWidth * 0.6) {
            setChatWidth(newWidth);
        }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
    }
    return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);


  if (!prData) {
    return <WelcomeScreen />;
  }

  return (
    <div className={clsx("flex flex-col h-screen bg-gray-950 text-white font-sans", isResizing && "cursor-col-resize select-none")}>
      {/* Header */}
      <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button 
             onClick={() => setPRData(null as any)} // Cast to any to allow nulling out to go back
             className="text-gray-500 hover:text-white transition-colors"
             title="Back to Welcome Screen"
          >
             <ArrowLeft size={20} />
          </button>
          <GitPullRequest className="text-blue-500" />
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold flex items-center gap-2 truncate">
              {prData.title}
              <span className="text-xs font-normal text-gray-500 px-2 py-0.5 border border-gray-700 rounded-full">#{prData.id}</span>
            </h1>
            <p className="text-xs text-gray-500 truncate">
                by {prData.author} • {prData.headRef} ➝ {prData.baseRef}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
           {/* Voice Controls */}
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

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: File Tree */}
        {showTree && (
            <div className="w-[260px] flex-shrink-0 transition-all duration-300">
              <FileTree />
            </div>
        )}

        {/* Center: Walkthrough Panel (Top) + Code Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-950 border-r border-gray-800">
            {walkthrough && <WalkthroughPanel />}
            <div className="flex-1 overflow-hidden relative">
                <CodeViewer />
                
                {/* Floating Status Bar */}
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

        {/* Sidebar: Chat */}
        {showChat && (
             <div className="flex shrink-0 h-full relative" style={{ width: chatWidth }}>
                {/* Resize Handle */}
                <div 
                    onMouseDown={startResizing}
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