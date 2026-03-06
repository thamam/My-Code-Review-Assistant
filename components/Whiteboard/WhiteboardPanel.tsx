import React, { useState, useRef, useEffect } from 'react';
import { usePR } from '../../contexts/PRContext';
import { Plus, Trash2, StickyNote } from 'lucide-react';
import clsx from 'clsx';

const NOTE_COLORS = [
  'bg-yellow-900/40 border-yellow-700/50 text-yellow-100',
  'bg-blue-900/40 border-blue-700/50 text-blue-100',
  'bg-green-900/40 border-green-700/50 text-green-100',
  'bg-red-900/40 border-red-700/50 text-red-100',
  'bg-purple-900/40 border-purple-700/50 text-purple-100',
];

export const WhiteboardPanel: React.FC = () => {
  const { notes, addNote, updateNote, removeNote } = usePR();
  const [editingId, setEditingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea after React commits the new note to the DOM
  useEffect(() => {
    if (editingId) textareaRef.current?.focus();
  }, [editingId]);

  const handleAdd = () => {
    const id = addNote('');
    setEditingId(id);
  };

  const handleBlur = (id: string, text: string) => {
    // Persist final text on blur (avoids per-keystroke context re-renders)
    updateNote(id, text);
    if (!text.trim()) removeNote(id);
    setEditingId(null);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 select-none">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-yellow-400" />
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Whiteboard</h2>
        </div>
        <button
          onClick={handleAdd}
          className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
          title="Add note"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <StickyNote size={24} className="text-gray-700" />
            <p className="text-xs text-gray-600">No notes yet.</p>
            <p className="text-[10px] text-gray-700">Click + to add a review note.</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          {notes.map((note, i) => {
            const colorClass = NOTE_COLORS[i % NOTE_COLORS.length];
            const isEditing = editingId === note.id;
            return (
              <div
                key={note.id}
                className={clsx(
                  'group relative rounded border p-2 min-h-[80px] transition-colors',
                  colorClass
                )}
              >
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    defaultValue={note.text}
                    onBlur={e => handleBlur(note.id, e.target.value)}
                    className="w-full h-full min-h-[60px] bg-transparent text-xs resize-none outline-none placeholder-current opacity-70"
                    placeholder="Type your note..."
                  />
                ) : (
                  <div
                    onClick={() => setEditingId(note.id)}
                    className="text-xs whitespace-pre-wrap cursor-text min-h-[60px]"
                  >
                    {note.text || <span className="opacity-40 italic">Empty — click to edit</span>}
                  </div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); removeNote(note.id); }}
                  className="absolute top-1 right-1 p-0.5 opacity-0 group-hover:opacity-100 text-current hover:bg-black/20 rounded transition-opacity"
                  title="Delete note"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
