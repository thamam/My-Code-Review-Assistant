import React, { useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { MapPin, Tag, Download, Trash2, Edit2, Info } from 'lucide-react';

export const AnnotationList: React.FC = () => {
  const { annotations, removeAnnotation, updateAnnotation, selectFile, prData } = usePR();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleExport = () => {
      let md = "# Code Review Annotations\n\n";
      annotations.forEach(a => {
          md += `## [${a.type.toUpperCase()}] ${a.title}\n`;
          md += `- File: \`${a.file}\`\n`;
          md += `- Line: ${a.line}\n`;
          if (a.description) md += `- Description: ${a.description}\n`;
          md += `\n`;
      });
      
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'annotations.md';
      a.click();
  };

  const handleEdit = (id: string, currentTitle: string) => {
      setEditingId(id);
      setEditTitle(currentTitle);
  };

  const saveEdit = (id: string) => {
      updateAnnotation(id, { title: editTitle });
      setEditingId(null);
  };

  const jumpTo = (file: string, line: number) => {
      if (prData) {
          const fileObj = prData.files.find(f => f.path === file);
          if (fileObj) selectFile(fileObj);
      }
  };

  return (
    <div className="h-full bg-gray-900 border-l border-gray-800 flex flex-col">
       <div className="p-3 border-b border-gray-800 flex justify-between items-center">
           <h2 className="text-xs font-bold text-gray-400 uppercase">Annotations</h2>
           <button onClick={handleExport} className="p-1 hover:text-white text-gray-500" title="Export Markdown">
               <Download size={14} />
           </button>
       </div>
       
       <div className="bg-blue-900/10 border-b border-blue-900/20 p-2 text-[10px] text-blue-300 flex items-start gap-2">
           <Info size={12} className="shrink-0 mt-0.5" />
           <p>
               <strong>Left-click</strong> a line number to mark.<br/>
               <strong>Right-click</strong> to add a label/note.
           </p>
       </div>

       <div className="flex-1 overflow-y-auto p-2 space-y-2">
           {annotations.length === 0 && (
               <div className="text-center text-gray-600 text-xs py-4 italic">
                   No annotations yet.
               </div>
           )}
           {annotations.map(a => (
               <div key={a.id} className="bg-gray-800 rounded p-2 text-sm group border border-gray-700 hover:border-gray-600 transition-colors">
                   <div className="flex justify-between items-start mb-1">
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                           {a.type === 'marker' ? <MapPin size={12} className="text-blue-400" /> : <Tag size={12} className="text-yellow-400" />}
                           {editingId === a.id ? (
                               <input 
                                   value={editTitle} 
                                   onChange={e => setEditTitle(e.target.value)}
                                   onBlur={() => saveEdit(a.id)}
                                   onKeyDown={e => e.key === 'Enter' && saveEdit(a.id)}
                                   className="bg-gray-950 border border-gray-700 rounded px-1 w-24 text-white focus:border-blue-500 focus:outline-none"
                                   autoFocus
                               />
                           ) : (
                               <span className={a.type === 'marker' ? 'text-blue-200' : 'text-yellow-200'}>
                                   {a.type === 'marker' ? '@' : ''}{a.title}
                               </span>
                           )}
                       </div>
                       <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                           <button onClick={() => handleEdit(a.id, a.title || '')} className="text-gray-500 hover:text-white" title="Edit"><Edit2 size={12} /></button>
                           <button onClick={() => removeAnnotation(a.id)} className="text-gray-500 hover:text-red-400" title="Delete"><Trash2 size={12} /></button>
                       </div>
                   </div>
                   <div 
                        className="text-xs text-gray-500 cursor-pointer hover:text-blue-400 truncate flex items-center gap-1"
                        onClick={() => jumpTo(a.file, a.line)}
                   >
                       <span className="font-mono bg-gray-900 px-1 rounded">{a.line}</span>
                       <span className="truncate">{a.file}</span>
                   </div>
               </div>
           ))}
       </div>
    </div>
  );
};