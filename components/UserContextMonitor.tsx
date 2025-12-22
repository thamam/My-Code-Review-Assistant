import React, { useEffect } from 'react';
import { usePR } from '../contexts/PRContext';
import { useChat } from '../contexts/ChatContext';

/**
 * Headless component that observes PRContext changes
 * and pushes relevant state to the ChatContext ref.
 * This decouples the Chat from needing to re-render on every UI interaction.
 */
export const UserContextMonitor: React.FC = () => {
    const { leftTab, selectedFile, selectionState, activeDiagram } = usePR();
    const { updateUserContext } = useChat();

    // Monitor Tab Changes
    useEffect(() => {
        updateUserContext({ activeTab: leftTab });
    }, [leftTab, updateUserContext]);

    // Monitor File Changes
    useEffect(() => {
        updateUserContext({ activeFile: selectedFile?.path || null });
    }, [selectedFile?.path, updateUserContext]);

    // Monitor Selection Changes
    useEffect(() => {
        // Debounce selection updates to avoid flooding the context on rapid clicks
        const timer = setTimeout(() => {
            const selectionSummary = selectionState
                ? `Lines ${selectionState.startLine}-${selectionState.endLine} in ${selectionState.file}`
                : null;
            updateUserContext({ activeSelection: selectionSummary });
        }, 500);
        return () => clearTimeout(timer);
    }, [selectionState, updateUserContext]);

    // Monitor Diagram State
    useEffect(() => {
        updateUserContext({ activeDiagram: activeDiagram?.title || null });
    }, [activeDiagram, updateUserContext]);

    return null; // Headless component, renders nothing
};
