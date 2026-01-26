import React, { useEffect, useRef } from 'react';
import { usePR } from '../contexts/PRContext';
import { useChat } from '../contexts/ChatContext';
import { useLive } from '../contexts/LiveContext';
import { useSpec } from '../contexts/SpecContext';
import { generateBrief, DirectorInput } from '../src/services/DirectorService';
import { eventBus } from '../src/modules/core/EventBus';

/**
 * Headless component that observes PRContext changes
 * and pushes relevant state to the ChatContext ref.
 * This decouples the Chat from needing to re-render on every UI interaction.
 * 
 * Phase 6: Also invokes the Director on file change to generate ContextBriefs
 * for injection into the Live voice session.
 * 
 * Phase 17: Added "Instant Anchor" for S2S low-latency grounding.
 */
export const UserContextMonitor: React.FC = () => {
    const { leftTab, selectedFile, selectionState, activeDiagram, prData, focusedLocation, lazyFiles } = usePR();
    const { updateUserContext } = useChat();
    const { isActive: isLiveActive, injectBrief, sendText: sendLiveText } = useLive();
    const { activeSpec } = useSpec(); // Get spec atoms

    // Track the current file path for race condition handling (latest-wins)
    const currentFileRef = useRef<string | null>(null);

    // FR-041/FR-042: Global User Activity Tracker
    useEffect(() => {
        const handleActivity = () => {
            eventBus.emit({
                type: 'USER_ACTIVITY',
                payload: { timestamp: Date.now() }
            });
        };

        window.addEventListener('mousemove', handleActivity, { passive: true });
        window.addEventListener('keydown', handleActivity, { passive: true });
        window.addEventListener('mousedown', handleActivity, { passive: true });

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('mousedown', handleActivity);
        };
    }, []);

    // Monitor Tab Changes
    useEffect(() => {
        // Filter out terminal tab since UserContextState only supports the 4 main tabs
        const validTab = leftTab === 'terminal' ? 'files' : leftTab;
        updateUserContext({ activeTab: validTab });
    }, [leftTab, updateUserContext]);

    // Monitor File Changes + Director Integration
    useEffect(() => {
        // Fallback chain: Explicit Selection -> Code Viewer Focus
        const filePath = selectedFile?.path || focusedLocation?.file || null;
        
        currentFileRef.current = filePath;
        updateUserContext({ activeFile: filePath });

        // S2S Grounding: Send INSTANT Visual Anchor to the live session
        // This bypasses the Director's analysis latency for immediate filename awareness.
        if (filePath && isLiveActive) {
            console.debug('[ShadowPartner] Sending Instant Anchor:', filePath);
            sendLiveText(`[CONTEXT UPDATE] VISUAL_ANCHOR: ${filePath}`);
        }

        // Skip Director if no file or no PR data
        if (!filePath || !prData) return;

        // Debounce 500ms before calling Director for deep analysis
        const timer = setTimeout(async () => {
            // Latest-wins: check if file is still the same
            if (currentFileRef.current !== filePath) {
                console.debug('[Director] Skipping stale brief for:', filePath);
                return;
            }

            // Get file content (Support both PR files and Ghost/Lazy files)
            let content = '';
            const prFile = prData.files.find(f => f.path === filePath);
            
            if (prFile) {
                content = prFile.newContent || '';
            } else {
                // Check Lazy Files (Repo Mode)
                const ghostFile = lazyFiles.get(filePath);
                if (ghostFile) {
                    content = ghostFile.content || '';
                }
            }

            if (!content) {
                console.debug('[Director] No content for file:', filePath);
                return;
            }

            const input: DirectorInput = {
                fileContent: content,
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
    }, [selectedFile?.path, focusedLocation?.file, prData, activeSpec, isLiveActive, updateUserContext, injectBrief, lazyFiles, sendLiveText]);

    // Monitor Selection Changes
    useEffect(() => {
        // Debounce selection updates to avoid flooding the context on rapid clicks
        const timer = setTimeout(() => {
            const selectionSummary = selectionState
                ? `Lines ${selectionState.startLine}-${selectionState.endLine} in ${selectionState.file}`
                : null;
            updateUserContext({ activeSelection: selectionSummary });

            // S2S Grounding: Also update the Live session about the selection
            if (selectionSummary && isLiveActive) {
                console.debug('[ShadowPartner] Sending Selection Anchor:', selectionSummary);
                sendLiveText(`[CONTEXT UPDATE] ACTIVE_SELECTION: ${selectionSummary}`);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [selectionState, updateUserContext, isLiveActive, sendLiveText]);

    // Monitor Diagram State
    useEffect(() => {
        const diagramTitle = activeDiagram?.title || null;
        updateUserContext({ activeDiagram: diagramTitle });

        // S2S Grounding: Immediate diagram awareness
        if (diagramTitle && isLiveActive) {
            sendLiveText(`[CONTEXT UPDATE] ACTIVE_DIAGRAM: ${diagramTitle}`);
        }
    }, [activeDiagram, updateUserContext, isLiveActive, sendLiveText]);

    return null; // Headless component, renders nothing
};