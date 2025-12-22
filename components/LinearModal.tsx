import React, { useState, useEffect } from 'react';
import { usePR } from '../contexts/PRContext';
import { LinearService } from '../services/linear';
import { X, Check, Loader2, AlertCircle, Link, Key } from 'lucide-react';

const USER_CONFIG = {
    LINEAR_API_KEY: import.meta.env.VITE_LINEAR_API_KEY || '',
    DEFAULT_LINEAR_ISSUE: ''
};

interface LinearModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LinearModal: React.FC<LinearModalProps> = ({ isOpen, onClose }) => {
    const { setLinearIssue } = usePR();

    const [apiKey, setApiKey] = useState(() => {
        return USER_CONFIG.LINEAR_API_KEY || localStorage.getItem('vcr_linear_key') || '';
    });

    const [issueId, setIssueId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setIssueId(USER_CONFIG.DEFAULT_LINEAR_ISSUE || '');
            setError(null);
            // Refresh key from config/storage in case it changed externally
            setApiKey(USER_CONFIG.LINEAR_API_KEY || localStorage.getItem('vcr_linear_key') || '');
        }
    }, [isOpen]);

    const handleSaveKey = () => {
        // Only save to localStorage if it's not coming from config
        if (!USER_CONFIG.LINEAR_API_KEY) {
            localStorage.setItem('vcr_linear_key', apiKey);
        }
    };

    const handleLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey || !issueId) return;

        setIsLoading(true);
        setError(null);
        handleSaveKey();

        try {
            const issue = await LinearService.getIssue(apiKey, issueId);
            setLinearIssue(issue);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to fetch issue");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const isConfigKey = !!USER_CONFIG.LINEAR_API_KEY;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wide flex items-center gap-2">
                        <Link size={16} className="text-blue-500" />
                        Link Linear Issue
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleLink} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Linear Personal API Key</label>
                        <div className="relative">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={isConfigKey ? "Loaded from userConfig.ts" : "lin_api_..."}
                                className={`w-full bg-gray-950 border rounded p-2.5 text-sm text-white focus:outline-none pl-9 ${isConfigKey
                                        ? "border-green-900 text-green-400 focus:border-green-700"
                                        : "border-gray-700 focus:border-blue-500"
                                    }`}
                            />
                            <Key size={14} className={`absolute left-3 top-3 ${isConfigKey ? "text-green-500" : "text-gray-600"}`} />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">Get this from your Linear Profile Settings.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Issue Identifier</label>
                        <input
                            type="text"
                            value={issueId}
                            onChange={(e) => setIssueId(e.target.value)}
                            placeholder="ENG-123"
                            className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none uppercase"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-800 rounded text-xs text-red-200 flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !apiKey || !issueId}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            Link Issue
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};