import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { usePR } from '../../contexts/PRContext';
import { useChat } from '../../contexts/ChatContext';

/**
 * SelectionToolbar - Floating toolbar that appears when code is selected
 * PHASE 4: Verify It Flow - Check selected code against Linear requirements
 */
export const SelectionToolbar: React.FC = () => {
    const { selectionState, linearIssue } = usePR();
    const { sendMessage: sendChatMessage } = useChat();

    // Only show when we have both a selection and a linked Linear issue
    if (!selectionState || !linearIssue) return null;

    const handleVerify = async () => {
        const prompt = `I have selected this code in ${selectionState.file} (lines ${selectionState.startLine}-${selectionState.endLine}).
Does it satisfy the Acceptance Criteria of the active Linear Issue ${linearIssue.identifier}?

Selected Code:
\`\`\`
${selectionState.content}
\`\`\``;

        try {
            await sendChatMessage(prompt);
        } catch (e) {
            console.error("Verify failed", e);
        }
    };

    return (
        <div
            className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl px-2 py-1.5 flex items-center gap-2"
            style={{
                bottom: '80px',
                left: '50%',
                transform: 'translateX(-50%)'
            }}
            data-testid="selection-toolbar"
        >
            <span className="text-xs text-gray-400 font-mono">
                L{selectionState.startLine}-{selectionState.endLine}
            </span>
            <div className="w-px h-4 bg-gray-700" />
            <button
                onClick={handleVerify}
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-purple-300 hover:text-purple-200 hover:bg-purple-900/30 rounded transition-colors"
                title="Check if selection satisfies Linear issue requirements"
                data-testid="verify-requirement-button"
            >
                <ClipboardCheck size={14} />
                Check vs Requirement
            </button>
        </div>
    );
};
