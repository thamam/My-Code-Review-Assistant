import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PRProvider, usePR } from './contexts/PRContext';
import { ChatProvider, useChat } from './contexts/ChatContext';
import { LiveProvider, useLive } from './contexts/LiveContext';
import { UserContextMonitor } from './components/UserContextMonitor';
import { FileTree } from './components/FileTree/FileTree';
import { CodeViewer } from './components/CodeViewer/CodeViewer';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { WalkthroughPanel } from './components/Walkthrough/WalkthroughPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AnnotationList } from './components/Annotations/AnnotationList';
import { LinearModal } from './components/LinearModal';
import { LinearPanel } from './components/LinearPanel';
import { DiagramPanel } from './components/Diagrams/DiagramPanel';
import { DiagramViewer } from './components/Diagrams/DiagramViewer';
import { Layout, MessageSquare, ArrowLeft, Mic, Loader2, BookMarked, FolderTree, RotateCcw, Link, Pause, FileUp, Target, Workflow, Eye } from 'lucide-react';
import clsx from 'clsx';
import { parseWalkthroughFile } from './services/walkthroughParser';

const VoiceControls = () => {
    const { isActive, isConnecting, connect, disconnect, error, volume } = useLive();
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
            {error && <div className="text-[10px] bg-red-900/50 border border-red-500/50 text-red-200 px-2 py-1 rounded animate-pulse">{error}</div>}

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

            <button
                onClick={isActive ? disconnect : connect}
                disabled={isConnecting}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded transition-all relative overflow-hidden group/btn",
                    isActive
                        ? "bg-amber-900/30 border-amber-500/50 text-amber-200 hover:bg-amber-900/50"
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                )}
                title={isActive ? "Stop Session" : "Voice Review"}
            >
                {isActive && (
                    <div
                        className="absolute inset-0 bg-amber-500/10 transition-transform duration-75 ease-out origin-left pointer-events-none"
                        style={{ transform: `scaleX(${0.1 + volume})` }}
                    />
                )}

                {isConnecting ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : isActive ? (
                    <>
                        <div className={clsx(
                            "w-2 h-2 rounded-full bg-amber-400 animate-ping absolute left-1 top-1",
                            volume < 0.05 && "opacity-0"
                        )} />
                        <Pause size={16} className="text-amber-400 relative z-10" />
                        <span className="hidden sm:inline relative z-10 font-bold uppercase tracking-widest text-[10px]">Theia Live</span>
                    </>
                ) : (
                    <>
                        <Mic size={16} className="group-hover/btn:scale-110 transition-transform" />
                        <span className="hidden sm:inline">Voice Review</span>
                    </>
                )}
            </button>
        </div>
    );
};

const MainLayout = () => {
    const { prData, setPRData, walkthrough, loadWalkthrough, isDiffMode, toggleDiffMode, linearIssue, activeDiagram, diagramViewMode, diagramSplitPercent, setDiagramSplitPercent, leftTab, setLeftTab } = usePR();
    const [showChat, setShowChat] = useState(true);
    const [showTree, setShowTree] = useState(true);
    const [showLinearModal, setShowLinearModal] = useState(false);
    const [chatWidth, setChatWidth] = useState(350);
    const [fileTreeWidth, setFileTreeWidth] = useState(280);

    const [isResizingChat, setIsResizingChat] = useState(false);
    const [isResizingTree, setIsResizingTree] = useState(false);
    const [isResizingDiagramSplit, setIsResizingDiagramSplit] = useState(false);

    const splitRef = useRef<HTMLDivElement>(null);

    const startResizingChat = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingChat(true);
    }, []);

    const startResizingTree = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingTree(true);
    }, []);

    const startResizingDiagram = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingDiagramSplit(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizingChat(false);
        setIsResizingTree(false);
        setIsResizingDiagramSplit(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizingChat) {
            const newWidth = document.body.clientWidth - e.clientX;
            if (newWidth > 250 && newWidth < document.body.clientWidth * 0.6) setChatWidth(newWidth);
        } else if (isResizingTree) {
            const newWidth = e.clientX;
            if (newWidth > 200 && newWidth < document.body.clientWidth * 0.4) setFileTreeWidth(newWidth);
        } else if (isResizingDiagramSplit && splitRef.current) {
            const rect = splitRef.current.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const percent = (offsetX / rect.width) * 100;
            if (percent > 10 && percent < 90) setDiagramSplitPercent(percent);
        }
    }, [isResizingChat, isResizingTree, isResizingDiagramSplit, setDiagramSplitPercent]);

    useEffect(() => {
        if (isResizingChat || isResizingTree || isResizingDiagramSplit) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizingChat, isResizingTree, isResizingDiagramSplit, resize, stopResizing]);

    const handleWalkthroughUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = await parseWalkthroughFile(file);
            loadWalkthrough(parsed);
        } catch (err: any) {
            alert(err.message || "Invalid file format");
        }
        e.target.value = '';
    };

    if (!prData) return <WelcomeScreen />;

    const isSplitMode = activeDiagram && diagramViewMode === 'split';

    return (
        <div className={clsx("flex flex-col h-screen bg-gray-950 text-white font-sans", (isResizingChat || isResizingTree || isResizingDiagramSplit) && "cursor-col-resize select-none")}>
            <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3 min-0 overflow-hidden">
                    <button
                        onClick={() => setPRData(null as any)}
                        className="text-gray-500 hover:text-white transition-colors shrink-0"
                        title="Exit Review"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                        <Eye size={18} className="text-amber-400" />
                        <span className="font-bold text-sm tracking-tight hidden sm:inline text-amber-100 uppercase">Theia</span>
                    </div>
                    <div className="h-4 w-px bg-gray-700 mx-1 hidden sm:block shrink-0" />
                    <div className="overflow-hidden min-w-0">
                        <h1 className="text-sm font-bold flex items-center gap-2 truncate">
                            {prData.title}
                            <span className="text-xs font-normal text-gray-500">#{prData.id}</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-white hover:bg-gray-700 cursor-pointer hidden lg:flex">
                        <FileUp size={14} />
                        <span>Load Walkthrough</span>
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

                    <button onClick={() => setShowTree(!showTree)} className={clsx("p-2 rounded hover:bg-gray-800", !showTree && "text-gray-500")}>
                        <Layout size={18} />
                    </button>
                    <button onClick={() => setShowChat(!showChat)} className={clsx("p-2 rounded hover:bg-gray-800", !showChat && "text-gray-500")}>
                        <MessageSquare size={18} />
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {showTree && (
                    <div className="flex shrink-0 h-full relative flex-col bg-gray-900 border-r border-gray-800" style={{ width: fileTreeWidth }}>
                        <div className="flex border-b border-gray-800 bg-gray-900">
                            <button onClick={() => setLeftTab('files')} className={clsx("flex-1 py-2 text-xs flex items-center justify-center transition-colors", leftTab === 'files' ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-300")} title="Files"><FolderTree size={14} /></button>
                            <button onClick={() => setLeftTab('annotations')} className={clsx("flex-1 py-2 text-xs flex items-center justify-center transition-colors", leftTab === 'annotations' ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-300")} title="Annotations"><BookMarked size={14} /></button>
                            <button onClick={() => setLeftTab('issue')} className={clsx("flex-1 py-2 text-xs flex items-center justify-center transition-colors", leftTab === 'issue' ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-300")} title="Issue"><Target size={14} /></button>
                            <button onClick={() => setLeftTab('diagrams')} className={clsx("flex-1 py-2 text-xs flex items-center justify-center transition-colors", leftTab === 'diagrams' ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-300")} title="Diagrams"><Workflow size={14} /></button>
                        </div>
                        <div className="w-full flex-1 overflow-hidden">
                            {leftTab === 'files' && <FileTree />}
                            {leftTab === 'annotations' && <AnnotationList />}
                            {leftTab === 'issue' && <LinearPanel onLinkClick={() => setShowLinearModal(true)} />}
                            {leftTab === 'diagrams' && <DiagramPanel />}
                        </div>
                        <div onMouseDown={startResizingTree} className="absolute right-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-amber-500 cursor-col-resize z-30 transition-colors" />
                    </div>
                )}

                <div className="flex-1 flex flex-col min-w-0 bg-gray-950 border-r border-gray-800">
                    {walkthrough && <WalkthroughPanel />}
                    <div ref={splitRef} className="flex-1 flex overflow-hidden relative">
                        {(!activeDiagram || diagramViewMode === 'split') && (
                            <div
                                className={clsx("flex flex-col overflow-hidden min-w-0 relative")}
                                style={isSplitMode ? { width: `${diagramSplitPercent}%` } : { flex: 1 }}
                            >
                                <CodeViewer />
                            </div>
                        )}

                        {isSplitMode && (
                            <div
                                onMouseDown={startResizingDiagram}
                                className="w-1 bg-gray-800 hover:bg-amber-500 cursor-col-resize z-40 transition-colors relative"
                            >
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-gray-800 border border-gray-700 rounded flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100">
                                    <div className="w-0.5 h-4 bg-gray-600 rounded-full" />
                                </div>
                            </div>
                        )}

                        {activeDiagram && (
                            <div
                                className={clsx("flex flex-col min-w-0 bg-gray-950 transition-all duration-300", diagramViewMode === 'split' ? "border-l border-gray-800" : "w-full absolute inset-0 z-30")}
                                style={isSplitMode ? { width: `${100 - diagramSplitPercent}%` } : {}}
                            >
                                <DiagramViewer />
                            </div>
                        )}
                    </div>
                </div>

                {showChat && (
                    <div className="flex shrink-0 h-full relative" style={{ width: chatWidth }}>
                        <div onMouseDown={startResizingChat} className="absolute left-0 top-0 bottom-0 w-1 bg-gray-800 hover:bg-amber-500 cursor-col-resize z-30 transition-colors" />
                        <div className="w-full h-full overflow-hidden"><ChatPanel /></div>
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
            <UserContextMonitor />
            <LiveProvider>
                <MainLayout />
            </LiveProvider>
        </ChatProvider>
    </PRProvider>
);

export default App;