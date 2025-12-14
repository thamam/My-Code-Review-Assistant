import React, { useState } from 'react';
import { PRProvider, usePR } from './contexts/PRContext';
import { ChatProvider } from './contexts/ChatContext';
import { FileTree } from './components/FileTree/FileTree';
import { CodeViewer } from './components/CodeViewer/CodeViewer';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { WalkthroughPanel } from './components/Walkthrough/WalkthroughPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { GitPullRequest, Layout, MessageSquare, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

const MainLayout = () => {
  const { prData, setPRData, walkthrough, viewportState, isDiffMode, toggleDiffMode } = usePR();
  const [showChat, setShowChat] = useState(true);
  const [showTree, setShowTree] = useState(true);

  if (!prData) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans">
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
           <button 
             onClick={toggleDiffMode}
             className="px-3 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition-colors"
           >
             {isDiffMode ? "Show Raw" : "Show Diff"}
           </button>
           
           <div className="h-6 w-px bg-gray-700 mx-1" />
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
                <div className="absolute bottom-4 right-8 bg-gray-900/90 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 shadow-xl backdrop-blur-sm pointer-events-none transition-opacity duration-500">
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
             <div className="transition-all duration-300">
                <ChatPanel />
             </div>
        )}
      </div>
    </div>
  );
};

const App = () => (
  <PRProvider>
    <ChatProvider>
      <MainLayout />
    </ChatProvider>
  </PRProvider>
);

export default App;