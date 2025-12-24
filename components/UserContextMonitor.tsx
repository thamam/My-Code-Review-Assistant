import React, { useEffect, useRef } from 'react';
import { usePR } from '../contexts/PRContext';
import { useChat } from '../contexts/ChatContext';
import { useLive } from '../contexts/LiveContext';
import { useSpec } from '../contexts/SpecContext';
import { generateBrief, DirectorInput } from '../src/services/DirectorService';

/**
 * Headless component that observes PRContext changes
 * and pushes relevant state to the ChatContext ref.
 * This decouples the Chat from needing to re-render on every UI interaction.
 * 
 * Phase 6: Also invokes the Director on file change to generate ContextBriefs
 * for injection into the Live voice session.
 */
export const UserContextMonitor: React.FC = () => {
    const { leftTab, selectedFile, selectionState, activeDiagram, prData } = usePR();
    const { updateUserContext } = useChat();
    const { isActive: isLiveActive, injectBrief } = useLive();
    const { activeSpec } = useSpec(); // Get spec atoms

    // Track the current file path for race condition handling (latest-wins)
    const currentFileRef = useRef<string | null>(null);

    // Monitor Tab Changes
    useEffect(() => {
        updateUserContext({ activeTab: leftTab });
    }, [leftTab, updateUserContext]);

    // Monitor File Changes + Director Integration
    useEffect(() => {
        const filePath = selectedFile?.path || null;
        currentFileRef.current = filePath;
        updateUserContext({ activeFile: filePath });

        // Skip Director if no file or no PR data
        if (!filePath || !prData || !selectedFile) return;

        // Debounce 500ms before calling Director
        const timer = setTimeout(async () => {
            // Latest-wins: check if file is still the same
            if (currentFileRef.current !== filePath) {
                console.debug('[Director] Skipping stale brief for:', filePath);
                return;
            }

            // Get file content
            const fileData = prData.files.find(f => f.path === filePath);
            if (!fileData?.newContent) {
                console.debug('[Director] No content for file:', filePath);
                return;
            }

            const input: DirectorInput = {
                fileContent: fileData.newContent,
                filePath,
                prTitle: prData.title,
                prDescription: prData.description,
                specAtoms: activeSpec?.atoms || []
            };

            console.debug('[Director] Generating brief for:', filePath);
            const brief = await generateBrief(input);

            // Latest-wins: check again after async call
            if (currentFileRef.current !== filePath) {
                console.debug('[Director] Discarding stale brief for:', filePath);
                return;
            }

            if (brief && isLiveActive) {
                injectBrief(brief);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [selectedFile?.path, prData, activeSpec, isLiveActive, updateUserContext, injectBrief]);

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

