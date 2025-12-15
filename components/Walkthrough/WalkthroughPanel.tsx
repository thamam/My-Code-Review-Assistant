import React from 'react';
import { usePR } from '../../contexts/PRContext';
import { Map, MapPin } from 'lucide-react';
import clsx from 'clsx';
import { arePathsEquivalent } from '../../utils/fileUtils';

export const WalkthroughPanel: React.FC = () => {
  const { walkthrough, activeSectionId, setActiveSectionId, selectFile, prData } = usePR();

  if (!walkthrough) return null;

  const handleSectionClick = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const section = walkthrough.sections.find(s => s.id === sectionId);
    if (section && section.files.length > 0 && prData) {
        // Find the full file object to select it using fuzzy matching
        const fileToSelect = prData.files.find(f => 
            arePathsEquivalent(f.path, section.files[0])
        );
        if (fileToSelect) {
            selectFile(fileToSelect);
        }
    }
  };

  return (
    <div className="flex flex-col border-b border-gray-800 bg-gray-800/30">
        <div className="p-3 flex items-center gap-2 text-purple-300 border-b border-gray-800/50">
            <Map size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Walkthrough: {walkthrough.title}</span>
        </div>
        <div className="flex overflow-x-auto p-2 gap-2 custom-scrollbar">
            {walkthrough.sections.map((section, idx) => {
                const isActive = activeSectionId === section.id;
                return (
                    <button
                        key={section.id}
                        onClick={() => handleSectionClick(section.id)}
                        className={clsx(
                            "flex-shrink-0 px-3 py-2 rounded-md text-left text-sm transition-all max-w-[200px] border",
                            isActive 
                                ? "bg-purple-900/40 border-purple-500 text-purple-100" 
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                        )}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className={clsx("flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold", isActive ? "bg-purple-500 text-white" : "bg-gray-700")}>
                                {idx + 1}
                            </span>
                            <span className="truncate font-medium">{section.title}</span>
                        </div>
                        {isActive && (
                             <p className="text-xs opacity-80 line-clamp-2 mt-1">{section.description}</p>
                        )}
                    </button>
                );
            })}
        </div>
    </div>
  );
};