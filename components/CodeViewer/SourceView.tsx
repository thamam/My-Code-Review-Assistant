import React, { useState, useCallback, useEffect } from 'react';
import Prism from 'prismjs';
import { usePR } from '../../contexts/PRContext';
import { Annotation } from '../../types';
import { MessageSquare, MapPin, Tag } from 'lucide-react';
import clsx from 'clsx';
import { AnnotationInput } from './AnnotationInput';
import { arePathsEquivalent } from '../../utils/fileUtils';

// --- Syntax Highlighting Helpers ---

const renderToken = (token: string | Prism.Token, key: number): React.ReactNode => {
    if (typeof token === 'string') return token;

    const className = `token ${token.type} ${token.alias || ''}`;

    const content = Array.isArray(token.content)
        ? token.content.map((t, i) => renderToken(t, i))
        : token.content.toString();

    return (
        <span key={key} className={className}>
            {content}
        </span>
    );
};

const HighlightedText: React.FC<{ text: string, language: string }> = React.memo(({ text, language }) => {
    if (text.length > 1000) return <>{text}</>;

    try {
        const grammar = Prism.languages[language] || Prism.languages.clike;
        if (!grammar) return <>{text}</>;

        const tokens = Prism.tokenize(text, grammar);
        return (
            <>
                {tokens.map((token, i) => renderToken(token, i))}
            </>
        );
    } catch (e) {
        return <>{text}</>;
    }
});

interface SourceViewProps {
    content: string;
    filePath: string;
}

export const SourceView: React.FC<SourceViewProps> = ({ content, filePath }) => {
    const { annotations, addAnnotation, removeAnnotation, selectionState, setSelectionState, focusedLocation } = usePR();
    const [hoveredLine, setHoveredLine] = useState<number | null>(null);
    const [creatingLabelLine, setCreatingLabelLine] = useState<number | null>(null);
    const [flashLine, setFlashLine] = useState<number | null>(null);

    const fileAnnotations = annotations.filter(a => a.file === filePath);
    const language = getLanguage(filePath);

    function getLanguage(path: string) {
        if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'javascript';
        if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
        if (path.endsWith('.py')) return 'python';
        if (path.endsWith('.css')) return 'css';
        if (path.endsWith('.html')) return 'html';
        if (path.endsWith('.json')) return 'json';
        if (path.endsWith('.md')) return 'markdown';
        return 'clike';
    }

    // Handle flash highlight for navigation
    useEffect(() => {
        if (focusedLocation && arePathsEquivalent(focusedLocation.file, filePath)) {
            setFlashLine(focusedLocation.line);
            const timer = setTimeout(() => setFlashLine(null), 1500);
            return () => clearTimeout(timer);
        }
    }, [focusedLocation, filePath]);

    const toggleMarker = (lineNum: number) => {
        const existingMarker = fileAnnotations.find(a => a.line === lineNum && a.type === 'marker');
        if (existingMarker) {
            removeAnnotation(existingMarker.id);
        } else {
            addAnnotation(filePath, lineNum, 'marker');
        }
    };

    const startLabelCreation = (lineNum: number) => {
        setCreatingLabelLine(lineNum);
    };

    const handleSaveLabel = (text: string) => {
        if (creatingLabelLine !== null) {
            addAnnotation(filePath, creatingLabelLine, 'label', text);
            setCreatingLabelLine(null);
        }
    };

    const handleInteraction = (e: React.MouseEvent, lineNum: number) => {
        e.stopPropagation();

        // Ctrl+Click or Cmd+Click -> Label
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            startLabelCreation(lineNum);
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            toggleMarker(lineNum);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, lineNum: number) => {
        e.preventDefault();
        e.stopPropagation();
        startLabelCreation(lineNum);
    };

    // Unified click/selection handler on the container
    const handleContainerClick = useCallback((e: React.MouseEvent) => {
        // 1. Check for Drag Selection (Range)
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const findLineNumber = (node: Node | null): number | null => {
                let curr = node as HTMLElement;
                while (curr) {
                    if (curr.getAttribute && curr.getAttribute('data-line-number')) {
                        return parseInt(curr.getAttribute('data-line-number')!, 10);
                    }
                    curr = curr.parentElement as HTMLElement;
                }
                return null;
            };

            const startLine = findLineNumber(range.startContainer);
            const endLine = findLineNumber(range.endContainer);

            if (startLine !== null && endLine !== null) {
                const actualStart = Math.min(startLine, endLine);
                const actualEnd = Math.max(startLine, endLine);
                const lines = content.split('\n');
                const selectedText = lines.slice(actualStart - 1, actualEnd).join('\n');

                if (selectedText) {
                    setSelectionState({
                        file: filePath,
                        startLine: actualStart,
                        endLine: actualEnd,
                        content: selectedText
                    });
                    return;
                }
            }
        }

        // 2. Fallback: Single Click (Collapsed) via Event Delegation
        // Find the clicked line element
        const target = e.target as HTMLElement;
        const lineEl = target.closest('[data-line-number]');

        if (lineEl) {
            const lineNum = parseInt(lineEl.getAttribute('data-line-number')!, 10);
            const lines = content.split('\n');
            const lineContent = lines[lineNum - 1];

            setSelectionState({
                file: filePath,
                startLine: lineNum,
                endLine: lineNum,
                content: lineContent
            });
        }
    }, [content, filePath, setSelectionState]);

    const linesList = content.split('\n');

    return (
        <div
            className="flex min-h-full font-mono text-sm bg-gray-950"
            onClick={handleContainerClick}
            onMouseUp={(e) => {
                // Optional: handle pure drag selection end if onClick doesn't fire for drags?
                // Usually onClick fires after mouseUp.
                // We can rely on onClick for both as long as we check selection.
            }}
        >
            {/* Gutter - ONLY Interaction Zone */}
            <div className="flex-shrink-0 w-12 bg-gray-900 border-r border-gray-800 text-gray-600 text-right select-none pt-2">
                {linesList.map((_, i) => {
                    const lineNum = i + 1;
                    const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
                    const hasMarker = lineAnnotations.some(a => a.type === 'marker');
                    const hasLabel = lineAnnotations.some(a => a.type === 'label');
                    const isFlashing = flashLine !== null && lineNum === flashLine;

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
                            onMouseEnter={() => setHoveredLine(lineNum)}
                            onMouseLeave={() => setHoveredLine(null)}
                            onClick={(e) => handleInteraction(e, lineNum)}
                            onContextMenu={(e) => handleContextMenu(e, lineNum)}
                            title="Left-Click: Marker | Right-Click / Ctrl+Click: Label"
                        >
                            {lineNum}
                            {hoveredLine === lineNum && !hasMarker && !hasLabel && !isSelected && (
                                <div className="absolute left-1 top-1 text-gray-500 opacity-50 pointer-events-none">
                                    <MapPin size={10} />
                                </div>
                            )}
                            {(hasMarker || hasLabel) && (
                                <div className="absolute left-1 top-1 text-blue-400 pointer-events-none">
                                    {hasLabel ? <MessageSquare size={10} className="text-yellow-400" /> : <MapPin size={10} />}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Code Area - Only for text selection */}
            <div className="flex-1 overflow-x-auto pt-2">
                <div className={`language-${language} !bg-transparent`}>
                    {linesList.map((line, i) => {
                        const lineNum = i + 1;
                        const lineAnnotations = fileAnnotations.filter(a => a.line === lineNum);
                        const isSelected = selectionState && selectionState.file === filePath &&
                            lineNum >= selectionState.startLine && lineNum <= selectionState.endLine;
                        const isFlashing = flashLine !== null && lineNum === flashLine;

                        return (
                            <div
                                key={i}
                                className={clsx(
                                    "relative h-6 leading-6 whitespace-pre px-4 transition-colors duration-200 flex items-center cursor-text",
                                    isSelected && "bg-blue-500/10",
                                    isFlashing && "bg-blue-500/20 shadow-[inset_2px_0_0_0_#60a5fa]"
                                )}
                                data-line-number={lineNum}
                            // No onClick here, handled by container
                            >
                                {creatingLabelLine === lineNum && (
                                    <AnnotationInput
                                        onSave={handleSaveLabel}
                                        onCancel={() => setCreatingLabelLine(null)}
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
        </div>
    );
};