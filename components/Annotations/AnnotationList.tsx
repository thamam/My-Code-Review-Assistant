import React, { useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { MapPin, Tag, Download, Trash2, Edit2 } from 'lucide-react';

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
          // Wait for file load then scroll - handled by CodeViewer via updated selectedFile
          // Note: In a real app we might need a dedicated "scrollToLine" context action,
          // but clicking the annotation usually implies context switch which resets viewport
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
       <div className="flex-1 overflow-y-auto p-2 space-y-2">
           {annotations.length === 0 && (
               <div className="text-center text-gray-600 text-xs py-4">
                   Click gutter line numbers to add markers.
               </div>
           )}
           {annotations.map(a => (
               <div key={a.id} className="bg-gray-800 rounded p-2 text-sm group">
                   <div className="flex justify-between items-start mb-1">
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                           {a.type === 'marker' ? <MapPin size={12} className="text-blue-400" /> : <Tag size={12} className="text-yellow-400" />}
                           {editingId === a.id ? (
                               <input 
                                   value={editTitle} 
                                   onChange={e => setEditTitle(e.target.value)}
                                   onBlur={() => saveEdit(a.id)}
                                   onKeyDown={e => e.key === 'Enter' && saveEdit(a.id)}
                                   className="bg-gray-950 border border-gray-700 rounded px-1 w-24"
                                   autoFocus
                               />
                           ) : (
                               <span className={a.type === 'marker' ? 'text-blue-200' : 'text-yellow-200'}>
                                   {a.type === 'marker' ? '@' : ''}{a.title}
                               </span>
                           )}
                       </div>
                       <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                           <button onClick={() => handleEdit(a.id, a.title || '')} className="text-gray-500 hover:text-white"><Edit2 size={12} /></button>
                           <button onClick={() => removeAnnotation(a.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                       </div>
                   </div>
                   <div 
                        className="text-xs text-gray-500 cursor-pointer hover:text-blue-400 truncate"
                        onClick={() => jumpTo(a.file, a.line)}
                   >
                       {a.file}:{a.line}
                   </div>
               </div>
           ))}
       </div>
    </div>
  );
};