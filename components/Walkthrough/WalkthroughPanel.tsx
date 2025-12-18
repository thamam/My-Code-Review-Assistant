
import React, { useState } from 'react';
import { usePR } from '../../contexts/PRContext';
import { Map, ChevronDown, ChevronUp, Expand, Minimize2 } from 'lucide-react';
import clsx from 'clsx';
import { arePathsEquivalent } from '../../utils/fileUtils';

export const WalkthroughPanel: React.FC = () => {
  const { walkthrough, activeSectionId, setActiveSectionId, navigateToCode, prData } = usePR();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!walkthrough) return null;

  const handleSectionClick = async (sectionId: string) => {
    setActiveSectionId(sectionId);
    const section = walkthrough.sections.find(s => s.id === sectionId);
    if (section && section.highlights && section.highlights.length > 0) {
        const highlight = section.highlights[0];
        await navigateToCode({
            filepath: highlight.file,
            line: highlight.lines[0],
            source: 'walkthrough'
        });
    } else if (section && section.files.length > 0) {
        await navigateToCode({
            filepath: section.files[0],
            line: 1,
            source: 'walkthrough'
        });
    }
  };

  return (
    <div className={clsx(
        "flex flex-col border-b border-gray-800 bg-gray-800/30 transition-all duration-300 ease-in-out relative z-10",
        isExpanded ? "flex-1 max-h-[40vh]" : "flex-none"
    )}>
        <div className="p-2 px-3 flex items-center justify-between border-b border-gray-800/50 bg-gray-900/50 flex-shrink-0">
            <div className="flex items-center gap-2 text-purple-300">
                <Map size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Walkthrough: {walkthrough.title}</span>
            </div>
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors flex items-center gap-1 text-xs"
                title={isExpanded ? "Collapse View" : "Expand View for Readability"}
            >
                {isExpanded ? (
                    <>
                        <Minimize2 size={14} /> Minimize
                    </>
                ) : (
                    <>
                        <Expand size={14} /> Expand
                    </>
                )}
            </button>
        </div>

        <div className={clsx(
            "flex p-2 gap-2 custom-scrollbar transition-all duration-300",
            isExpanded 
                ? "flex-wrap overflow-y-auto content-start items-stretch h-full" 
                : "flex-nowrap overflow-x-auto h-auto items-start"
        )}>
            {walkthrough.sections.map((section, idx) => {
                const isActive = activeSectionId === section.id;
                return (
                    <button
                        key={section.id}
                        onClick={() => handleSectionClick(section.id)}
                        className={clsx(
                            "flex-shrink-0 px-3 py-2 rounded-md text-left text-sm transition-all border group relative flex flex-col",
                            isActive 
                                ? "bg-purple-900/40 border-purple-500 text-purple-100" 
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750",
                            isExpanded ? "w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.33%-0.5rem)]" : "max-w-[240px] w-[240px]"
                        )}
                    >
                        <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                            <span className={clsx("flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold", isActive ? "bg-purple-500 text-white" : "bg-gray-700")}>
                                {idx + 1}
                            </span>
                            <span className="truncate font-medium">{section.title}</span>
                        </div>
                        <p className={clsx(
                            "text-xs opacity-90 leading-relaxed",
                            isExpanded ? "whitespace-normal text-gray-300" : "line-clamp-2 text-gray-400"
                        )}>
                            {section.description}
                        </p>
                    </button>
                );
            })}
        </div>
    </div>
  );
};
