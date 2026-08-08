import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

interface AnnotationInputProps {
  initialValue?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export const AnnotationInput: React.FC<AnnotationInputProps> = ({ initialValue = '', onSave, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (value.trim()) onSave(value);
      else onCancel();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="absolute left-10 top-0 z-50 flex items-center bg-gray-900 border border-purple-500 rounded shadow-lg" onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add label..."
        className="bg-transparent border-none text-xs text-white px-2 py-1 outline-none w-48"
      />
      <button onClick={() => value.trim() ? onSave(value) : onCancel()} className="p-1 hover:text-green-400 text-gray-400">
        <Check size={12} />
      </button>
      <button onClick={onCancel} className="p-1 hover:text-red-400 text-gray-400">
        <X size={12} />
      </button>
    </div>
  );
};