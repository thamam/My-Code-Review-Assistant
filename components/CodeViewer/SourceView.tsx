import React, { useMemo } from 'react';
import { usePR } from '../../contexts/PRContext';
import { MapPin, Tag } from 'lucide-react';
import clsx from 'clsx';
import { AnnotationInput } from './AnnotationInput';
import { SelectionToolbar } from './SelectionToolbar';
import { LineMarker } from './LineMarker';
import { arePathsEquivalent } from '../../utils/fileUtils';
import { getLanguage, HighlightedText } from './syntaxHelpers';
import { useViewportTracker } from './useViewportTracker';
import { registerLine, unregisterLine } from '../../src/modules/navigation/lineRegistry';
import { useLineInteractions } from './useLineInteractions';
import { coordAttr, coordsEqual, type LineCoord, type LineEntry } from './lineCoord';
import { LineGutterIndicator } from './LineGutterIndicator';

interface SourceViewProps {
    content: string;
    filePath: string;
    onViewportChange?: (file: string, startLine: number, endLine: number) => void;
}

export const SourceView: React.FC<SourceViewProps> = ({ content, filePath, onViewportChange }) => {
    const { selectionState, focusedLocation, isFlashActive } = usePR();
    const interactions = useLineInteractions({ filePath });

    const { handleLineVisibility } = useViewportTracker(filePath, onViewportChange);

    const language = getLanguage(filePath);

    const isLineFlashing = (lineNum: number) =>
        isFlashActive && !!focusedLocation && arePathsEquivalent(focusedLocation.file, filePath) && lineNum === focusedLocation.line;

    const linesList = useMemo(() => content.split('\n'), [content]);

    const lineEntries = useMemo<LineEntry[]>(() =>
        linesList.map((line, i): LineEntry => ({ coord: { side: 'new', line: i + 1 }, content: line })),
        [linesList]
    );

    return (
        <div
            className="flex min-h-full font-mono text-sm bg-gray-950"
            onClick={() => interactions.captureSelection(lineEntries)}
        >
            {/* Gutter - ONLY Interaction Zone */}
            <div className="flex-shrink-0 w-12 bg-gray-900 border-r border-gray-800 text-gray-600 text-right select-none pt-2">
                {linesList.map((_, i) => {
                    const lineNum = i + 1;
                    const coord: LineCoord = { side: 'new', line: lineNum };
                    const lineAnnotations = interactions.annotationsAt(coord);
                    const hasMarker = lineAnnotations.some(a => a.type === 'marker');
                    const hasLabel = lineAnnotations.some(a => a.type === 'label');
                    const isFlashing = isLineFlashing(lineNum);
                    const isHovered = !!interactions.hoveredCoord && coordsEqual(interactions.hoveredCoord, coord);

                    const isSelected = selectionState && selectionState.file === filePath &&
                        lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;

                    return (
                        <div
                            key={i}
                            className={clsx(
                                "h-6 leading-6 pr-2 relative hover:bg-gray-800 cursor-pointer group transition-all duration-200 z-20",
                                isSelected
                                    ? "bg-blue-900/30 text-blue-200 border-l-4 border-blue-500 font-bold"
                                    : "border-l-4 border-transparent",
                                isFlashing && "bg-blue-600/30 text-blue-100 border-l-4 border-blue-400 font-bold"
                            )}
                            onMouseEnter={() => interactions.setHoveredCoord(coord)}
                            onMouseLeave={() => interactions.setHoveredCoord(null)}
                            onClick={(e) => interactions.handleInteraction(e, coord)}
                            onContextMenu={(e) => interactions.handleContextMenu(e, coord)}
                            title="Left-Click: Marker | Right-Click / Ctrl+Click: Label"
                        >
                            {lineNum}
                            <LineGutterIndicator size={10} isHovered={isHovered} isSelected={!!isSelected} hasMarker={hasMarker} hasLabel={hasLabel} />
                        </div>
                    );
                })}
            </div>

            {/* Code Area - Only for text selection */}
            <div className="flex-1 overflow-x-auto pt-2">
                <div className={`language-${language} !bg-transparent`}>
                    {linesList.map((line, i) => {
                        const lineNum = i + 1;
                        const coord: LineCoord = { side: 'new', line: lineNum };
                        const lineAnnotations = interactions.annotationsAt(coord);
                        const isSelected = selectionState && selectionState.file === filePath &&
                            lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;
                        const isFlashing = isLineFlashing(lineNum);
                        const isCreatingLabel = !!interactions.creatingLabelCoord && coordsEqual(interactions.creatingLabelCoord, coord);
                        let registeredEl: HTMLElement | null = null;

                        return (
                            <div
                                key={i}
                                ref={(el) => {
                                    if (el) {
                                        registerLine(filePath, lineNum, el);
                                        registeredEl = el;
                                    } else if (registeredEl) {
                                        unregisterLine(filePath, lineNum, registeredEl);
                                        registeredEl = null;
                                    }
                                }}
                                className={clsx(
                                    "relative h-6 leading-6 whitespace-pre px-4 transition-colors duration-200 flex items-center cursor-text",
                                    isSelected && "bg-blue-500/10",
                                    isFlashing && "bg-blue-500/20 shadow-[inset_2px_0_0_0_#60a5fa]"
                                )}
                                data-line-number={lineNum}
                                data-line-coord={coordAttr(coord)}
                            >
                                <LineMarker
                                    lineId={`${filePath}:${lineNum}`}
                                    lineNumber={lineNum}
                                    onVisible={handleLineVisibility}
                                />
                                {isCreatingLabel && (
                                    <AnnotationInput
                                        onSave={interactions.handleSaveLabel}
                                        onCancel={interactions.cancelLabelCreation}
                                    />
                                )}

                                <span className="inline-block min-w-full">
                                    <HighlightedText text={line || ' '} language={language} />
                                </span>

                                {lineAnnotations.length > 0 && (
                                    <div className="absolute right-4 top-0 h-full flex items-center gap-2 pointer-events-none opacity-80">
                                        {lineAnnotations.map(a => (
                                            <span key={a.id} className={clsx(
                                                "text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm",
                                                a.type === 'label' ? "bg-yellow-900 text-yellow-200" : "bg-blue-900 text-blue-200"
                                            )}>
                                                {a.type === 'label' ? <Tag size={10} /> : <MapPin size={10} />}
                                                {a.title}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <SelectionToolbar />
        </div>
    );
};
