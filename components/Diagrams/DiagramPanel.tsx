import React, { useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { DiagramAgent } from '../../services/diagramAgent';
import { Play, Plus, Trash2, Download, Workflow, MessageSquarePlus, Loader2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

export const DiagramPanel: React.FC = () => {
    const { prData, diagrams, addDiagram, removeDiagram, activeDiagram, setActiveDiagram, setDiagrams } = usePR();
    const [isGenerating, setIsGenerating] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const [showPromptInput, setShowPromptInput] = useState(false);

    const agent = new DiagramAgent();

    const handleAutoGenerate = async () => {
        if (!prData) return;
        setIsGenerating(true);
        try {
            const proposed = await agent.proposeDiagrams(prData);
            proposed.forEach(d => addDiagram(d));
        } catch (e) {
            alert("Failed to generate diagrams. Check API Key or try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCustomGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prData || !customPrompt.trim()) return;
        setIsGenerating(true);
        try {
            const diagram = await agent.generateCustomDiagram(prData, customPrompt);
            addDiagram(diagram);
            setCustomPrompt('');
            setShowPromptInput(false);
            setActiveDiagram(diagram);
        } catch (e) {
            alert("Failed to generate custom diagram.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRefresh = async () => {
        if (!prData) return;
        // In a real app we might ask confirmation, but for "Refresh" it's often implicit "Reload".
        // We clear existing diagrams before regenerating.
        setDiagrams([]);
        setActiveDiagram(null);
        await handleAutoGenerate();
    };

    const handleExport = (diagram: any) => {
        const blob = new Blob([diagram.mermaidCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${diagram.title.replace(/\s+/g, '_')}.mmd`;
        a.click();
    };

    return (
        <div className="h-full bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-3 border-b border-gray-800 bg-gray-900">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sequence Diagrams</h2>
                    <button
                        onClick={handleRefresh}
                        disabled={isGenerating}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Refresh Diagrams"
                    >
                        <RotateCcw size={14} className={clsx(isGenerating && "animate-spin")} />
                    </button>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleAutoGenerate}
                        disabled={isGenerating}
                        className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Workflow size={14} />}
                        Auto-Suggest
                    </button>
                    <button
                        onClick={() => setShowPromptInput(!showPromptInput)}
                        className="px-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300"
                        title="Create Custom Diagram"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {showPromptInput && (
                    <form onSubmit={handleCustomGenerate} className="mt-3 animate-in slide-in-from-top-2">
                        <textarea
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value)}
                            placeholder="Describe the flow (e.g., 'Login process with error handling')..."
                            className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white focus:border-purple-500 outline-none h-20 mb-2 resize-none"
                        />
                        <button
                            type="submit"
                            disabled={isGenerating || !customPrompt.trim()}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded flex items-center justify-center gap-1"
                        >
                            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <MessageSquarePlus size={12} />}
                            Generate
                        </button>
                    </form>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {diagrams.length === 0 && !isGenerating && (
                    <div className="text-center text-gray-500 text-xs py-8 px-4">
                        <Workflow size={24} className="mx-auto mb-2 opacity-30" />
                        <p>No diagrams yet.</p>
                        <p className="mt-1">Click "Auto-Suggest" to analyze the code.</p>
                    </div>
                )}

                {diagrams.map(d => (
                    <div
                        key={d.id}
                        onClick={() => setActiveDiagram(d)}
                        className={clsx(
                            "group rounded-lg border p-3 cursor-pointer transition-all relative",
                            activeDiagram?.id === d.id
                                ? "bg-purple-900/20 border-purple-500 ring-1 ring-purple-500/50"
                                : "bg-gray-800 border-gray-700 hover:border-gray-600"
                        )}
                    >
                        <div className="flex justify-between items-start">
                            <h3 className={clsx("text-sm font-medium mb-1 line-clamp-1", activeDiagram?.id === d.id ? "text-purple-200" : "text-gray-200")}>
                                {d.title}
                            </h3>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                            {d.description}
                        </p>

                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-700/50">
                            <span className="text-[10px] text-gray-600 uppercase">
                                {d.isAutoGenerated ? 'Auto' : 'Custom'}
                            </span>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleExport(d); }}
                                    className="text-gray-500 hover:text-white"
                                    title="Export source"
                                >
                                    <Download size={12} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeDiagram(d.id); }}
                                    className="text-gray-500 hover:text-red-400"
                                    title="Delete"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};