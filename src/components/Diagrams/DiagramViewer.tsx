
import React from 'react';
import { usePR } from '../../contexts/PRContext';
import { MermaidRenderer } from './MermaidRenderer';
import { X, Columns, Maximize } from 'lucide-react';

export const DiagramViewer: React.FC = () => {
  const { activeDiagram, setActiveDiagram, diagramViewMode, setDiagramViewMode } = usePR();

  if (!activeDiagram) return null;

  const toggleViewMode = () => {
      setDiagramViewMode(diagramViewMode === 'full' ? 'split' : 'full');
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden border-l border-gray-800">
        <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900 shrink-0">
            <div className="flex flex-col overflow-hidden">
                <h2 className="text-sm font-bold text-gray-200 truncate">{activeDiagram.title}</h2>
                <span className="text-xs text-gray-500 truncate">{activeDiagram.description}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
                <button 
                    onClick={toggleViewMode}
                    className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                    title={diagramViewMode === 'full' ? "Split View (Show Code)" : "Full Screen"}
                >
                    {diagramViewMode === 'full' ? <Columns size={16} /> : <Maximize size={16} />}
                </button>
                <button 
                    onClick={() => setActiveDiagram(null)}
                    className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                    title="Close Diagram"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
        <div className="flex-1 overflow-hidden relative">
            <MermaidRenderer 
                code={activeDiagram.mermaidCode} 
                id={activeDiagram.id} 
                references={activeDiagram.references}
            />
        </div>
    </div>
  );
};
