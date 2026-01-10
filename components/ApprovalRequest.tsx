/**
 * components/ApprovalRequest.tsx
 * Phase 15.3: The Control Panel - Human-in-the-Loop UI
 * 
 * Modal overlay that appears when the Agent requests permission
 * to execute a sensitive action (e.g., terminal commands, file writes).
 */

import React, { useEffect, useState } from 'react';
import { eventBus } from '../src/modules/core/EventBus';
import { AgentRequestApprovalEvent } from '../src/modules/core/types';

export const ApprovalRequest: React.FC = () => {
    const [request, setRequest] = useState<AgentRequestApprovalEvent['payload'] | null>(null);

    useEffect(() => {
        const unsubscribe = eventBus.subscribe('AGENT_REQUEST_APPROVAL', (envelope) => {
            const event = envelope.event;
            if (event.type === 'AGENT_REQUEST_APPROVAL') {
                setRequest(event.payload);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleDecision = (approved: boolean) => {
        eventBus.emit({
            type: 'USER_APPROVAL',
            payload: { approved, timestamp: Date.now() }
        });
        setRequest(null); // Clear the modal
    };

    if (!request) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-lg w-full mx-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                    <h2 className="text-xl font-mono font-bold text-white">
                        PERMISSION REQUIRED
                    </h2>
                </div>

                <div className="bg-black/40 p-4 rounded font-mono text-sm mb-6 border border-gray-800">
                    <div className="text-gray-400 mb-1">Tool:</div>
                    <div className="text-green-400 font-bold mb-3">{request.tool}</div>

                    <div className="text-gray-400 mb-1">Arguments:</div>
                    <pre className="text-blue-300 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {JSON.stringify(request.args, null, 2)}
                    </pre>
                </div>

                <div className="flex gap-4 justify-end">
                    <button
                        onClick={() => handleDecision(false)}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded font-mono border border-gray-600 transition-colors"
                    >
                        DENY
                    </button>
                    <button
                        onClick={() => handleDecision(true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-mono font-bold shadow-lg shadow-red-900/20 transition-colors"
                    >
                        AUTHORIZE
                    </button>
                </div>
            </div>
        </div>
    );
};
