
import React, { useState, useEffect, useCallback } from 'react';
import { Github, Loader2, PlayCircle, AlertCircle, HelpCircle, CheckSquare, Square, History, Database, RefreshCw, Upload, FileText, Clock, FileJson, Sparkles, BookOpen, Microscope, Crosshair, GitPullRequest } from 'lucide-react';
import { usePR } from '../contexts/PRContext';
import { SAMPLE_WALKTHROUGH } from '../mock/samplePR';
import { PRData, Walkthrough, PRHistoryItem, AppMode } from '../types/domain';
import { formatDistanceToNow } from 'date-fns';
import { parseWalkthroughFile, parseWalkthroughFromText } from '../services/walkthroughParser';
import { eventBus } from '../modules/core/EventBus';
import { getGitHubToken, saveGitHubToken, clearGitHubToken } from '../lib/credentials';
import { prSourceService } from '../modules/ingestion/PRSourceService';

const USER_CONFIG = {
  DEFAULT_PR_URL: import.meta.env.VITE_DEFAULT_PR_URL || '',
  DEFAULT_WALKTHROUGH_PATH: import.meta.env.VITE_DEFAULT_WALKTHROUGH_PATH || ''
};

// Marker written to the `?pr=` query param when the sample PR is loaded, so a
// reload can restore it the same way a real PR URL restores on reload.
const SAMPLE_URL_MARKER = 'sample';

export const WelcomeScreen: React.FC = () => {
  const { setPRData, loadWalkthrough, setAppMode, setCustomReviewGoal } = usePR();

  // Mode Selection State
  const [selectedMode, setSelectedMode] = useState<AppMode>('pr');
  const [customGoalInput, setCustomGoalInput] = useState('');

  const [url, setUrl] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const prParam = params.get('pr');
      if (prParam && prParam !== SAMPLE_URL_MARKER) return prParam;
      if (prParam === SAMPLE_URL_MARKER) return '';
      const local = localStorage.getItem('vcr_last_url');
      if (local) return local;
      return USER_CONFIG.DEFAULT_PR_URL || '';
    } catch { return ''; }
  });

  const [rememberToken, setRememberToken] = useState(() => {
    try {
      const saved = localStorage.getItem('vcr_remember_pref');
      return saved !== 'false';
    } catch { return true; }
  });

  const [token, setToken] = useState(() => getGitHubToken() || '');

  const [history, setHistory] = useState<PRHistoryItem[]>(() => prSourceService.getHistory());

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedData, setCachedData] = useState<PRData | null>(null);
  const [walkthroughFile, setWalkthroughFile] = useState<Walkthrough | null>(null);
  const [walkthroughFileName, setWalkthroughFileName] = useState<string>('');
  const [isAutoLoadingWalkthrough, setIsAutoLoadingWalkthrough] = useState(false);

  // --- Auto-load Default Walkthrough ---
  useEffect(() => {
    const loadDefaultWalkthrough = async () => {
      if (!USER_CONFIG.DEFAULT_WALKTHROUGH_PATH) return;

      setIsAutoLoadingWalkthrough(true);
      try {
        console.log(`[Theia] Attempting to auto-load walkthrough: ${USER_CONFIG.DEFAULT_WALKTHROUGH_PATH}`);
        const response = await fetch(USER_CONFIG.DEFAULT_WALKTHROUGH_PATH);
        if (!response.ok) throw new Error("Could not reach default walkthrough path.");

        const content = await response.text();
        const fileName = USER_CONFIG.DEFAULT_WALKTHROUGH_PATH.split('/').pop() || 'walkthrough.md';
        const parsed = parseWalkthroughFromText(content, fileName);

        setWalkthroughFile(parsed);
        setWalkthroughFileName(fileName);
        console.log(`[Theia] Successfully loaded default walkthrough: ${fileName}`);
      } catch (e) {
        console.warn("[Theia] Default walkthrough auto-load failed. This is expected if the path is a local OS absolute path blocked by browser security.", e);
      } finally {
        setIsAutoLoadingWalkthrough(false);
      }
    };
    loadDefaultWalkthrough();
  }, []);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setUrl(newValue);
    setError(null);
    try { localStorage.setItem('vcr_last_url', newValue); } catch { }
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setToken(newValue);
    setError(null);
    if (newValue.trim()) {
      saveGitHubToken(newValue, rememberToken);
    } else {
      clearGitHubToken();
    }
  };

  const toggleRemember = () => {
    const newState = !rememberToken;
    setRememberToken(newState);
    try {
      localStorage.setItem('vcr_remember_pref', String(newState));
      saveGitHubToken(token, newState);
    } catch { }
  };

  useEffect(() => {
    if (!url) { setCachedData(null); return; }
    const timer = setTimeout(() => {
      setCachedData(prSourceService.checkCache(url));
    }, 300);
    return () => clearTimeout(timer);
  }, [url]);

  const handleWalkthroughUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWalkthroughFileName(file.name);
    setWalkthroughFile(null);
    setError(null);
    try {
      const parsed = await parseWalkthroughFile(file);
      setWalkthroughFile(parsed);
    } catch (err: any) {
      setError(err.message || "Failed to parse walkthrough file.");
      setWalkthroughFileName('');
      e.target.value = '';
    }
  };

  const processDataLoad = (data: PRData) => {
    // Clear previous session's chat history before loading new data
    eventBus.emit({ type: 'SESSION_RESET', payload: { reason: 'new_session', repoName: data.title } });

    // Mode cards apply to the PR flow; repo-only mode (no PR files) always reviews as "Learn"
    const isRepoMode = data.files.length === 0;
    const effectiveMode: AppMode = isRepoMode ? 'learn' : selectedMode;
    setAppMode(effectiveMode);
    setCustomReviewGoal(effectiveMode === 'custom' ? customGoalInput : '');

    setPRData(data);
    if (walkthroughFile) {
      loadWalkthrough(walkthroughFile);
    }
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('pr', url);
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) { console.warn("Could not update URL history", e); }
  };

  const handleLoad = async (e: React.FormEvent | null, forceRefresh: boolean = false) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    if (selectedMode === 'custom' && !customGoalInput.trim()) {
      setError("Please describe the specific focus for your custom review.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, history: newHistory } = await prSourceService.load(url, forceRefresh, token.trim() || undefined);
      setHistory(newHistory);
      processDataLoad(data);
    } catch (err: any) {
      setError(err.message || "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSample = useCallback(() => {
    const data = prSourceService.loadSample();
    // Clear previous session's chat history before loading new data (mirrors processDataLoad above).
    eventBus.emit({ type: 'SESSION_RESET', payload: { reason: 'new_session', repoName: data.title } });

    // Mode-card + custom goal parity with processDataLoad — the sample has PR files, so it's never repo-mode.
    setAppMode(selectedMode);
    setCustomReviewGoal(selectedMode === 'custom' ? customGoalInput : '');

    setPRData(data);
    loadWalkthrough(SAMPLE_WALKTHROUGH);

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('pr', SAMPLE_URL_MARKER);
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) { console.warn("Could not update URL history", e); }
  }, [selectedMode, customGoalInput, setAppMode, setCustomReviewGoal, setPRData, loadWalkthrough]);

  // Restore the sample on reload, mirroring the pre-fill-from-`?pr=` restore
  // regular PR loads get for free from the `url` initializer above.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('pr') === SAMPLE_URL_MARKER) {
        loadSample();
      }
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ModeCard = ({ mode, icon: Icon, title, desc }: { mode: AppMode, icon: any, title: string, desc: string }) => (
    <button
      type="button"
      onClick={() => setSelectedMode(mode)}
      className={`flex-1 p-3 rounded-lg border text-left transition-all relative ${selectedMode === mode
          ? "bg-blue-900/20 border-blue-500 ring-1 ring-blue-500/50"
          : "bg-gray-950 border-gray-800 hover:border-gray-700 hover:bg-gray-900"
        }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={selectedMode === mode ? "text-blue-400" : "text-gray-500"} />
        <span className={`text-sm font-bold ${selectedMode === mode ? "text-white" : "text-gray-400"}`}>{title}</span>
      </div>
      <p className="text-[10px] text-gray-500 leading-tight">{desc}</p>
      {selectedMode === mode && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500" />}
    </button>
  );

  return (
    <div className="min-h-screen w-screen bg-gray-950 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden my-8">
        <div className="p-8 text-center border-b border-gray-800 bg-gray-900">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Github size={32} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-tighter">Theia</h1>
          <p className="text-gray-400 text-sm">
            Staff-level Code Review Visualization
          </p>
        </div>

        <div className="p-8 space-y-6">
          <form onSubmit={(e) => handleLoad(e, false)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Analysis Mode
              </label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <ModeCard mode="pr" icon={GitPullRequest} title="PR Review" desc="Standard review of changes." />
                <ModeCard mode="learn" icon={BookOpen} title="Learn Code Base" desc="Holistic architecture & structure." />
                <ModeCard mode="dive" icon={Microscope} title="Code Dive" desc="Deep analysis of single modules." />
                <ModeCard mode="custom" icon={Crosshair} title="Custom Focus" desc="Targeted review (Security, etc)." />
              </div>

              {selectedMode === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                    Review Goal
                  </label>
                  <input
                    type="text"
                    value={customGoalInput}
                    onChange={(e) => setCustomGoalInput(e.target.value)}
                    placeholder="e.g., 'Find security vulnerabilities' or 'Suggest refactoring'"
                    className="w-full bg-gray-950 border border-blue-900/50 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-gray-800 pt-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                GitHub Repository or PR URL
              </label>
              <input
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="https://github.com/owner/repo or .../pull/123"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={isLoading}
              />
              <p className="text-[10px] text-gray-500 mt-1.5">
                Paste a Repo URL (e.g., github.com/owner/repo) to explore the codebase without a PR.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>Access Token (Optional)</span>
                <HelpCircle size={14} className="text-gray-500 cursor-help" />
              </label>
              <input
                type="password"
                value={token}
                onChange={handleTokenChange}
                placeholder={import.meta.env.VITE_GITHUB_TOKEN ? "Loaded from userConfig.ts" : "github_pat_..."}
                className={`w-full bg-gray-950 border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors ${import.meta.env.VITE_GITHUB_TOKEN ? 'border-green-900 text-green-400' : 'border-gray-700'}`}
                disabled={isLoading}
              />
              <div className="flex items-center mt-3 gap-2">
                <button type="button" onClick={toggleRemember} className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors">
                  {rememberToken ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} className="text-gray-600" />}
                  <span className="text-xs">Save token locally</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>Walkthrough File (Optional)</span>
                {isAutoLoadingWalkthrough && <Loader2 size={12} className="animate-spin text-purple-400" />}
              </label>
              <div className="flex items-center gap-2">
                <label className={`flex-1 cursor-pointer border border-dashed rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 group ${walkthroughFileName ? "bg-purple-900/20 border-purple-500/50" : "bg-gray-950 border-gray-700 hover:bg-gray-900 hover:border-gray-600"
                  }`}>
                  {walkthroughFileName ? <FileText size={18} className="text-purple-400" /> : <Upload size={18} className="text-gray-500 group-hover:text-purple-400" />}
                  <span className={`text-sm truncate ${walkthroughFileName ? "text-purple-200" : "text-gray-400 group-hover:text-gray-300"}`}>
                    {walkthroughFileName || "Select Markdown / JSON"}
                  </span>
                  <input type="file" accept=".json, .md" className="hidden" onChange={handleWalkthroughUpload} />
                </label>
              </div>
              {USER_CONFIG.DEFAULT_WALKTHROUGH_PATH && !walkthroughFileName && !isAutoLoadingWalkthrough && (
                <p className="text-[10px] text-gray-500 mt-1 italic">Note: Browser blocked auto-load of local OS path. Please select manually.</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-200 text-sm">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              {cachedData ? (
                <>
                  <button type="button" onClick={() => handleLoad(null, false)} disabled={isLoading} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />} Load Cached
                  </button>
                  <button type="button" onClick={() => handleLoad(null, true)} disabled={isLoading} className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <RefreshCw size={18} /> Refresh
                  </button>
                </>
              ) : (
                <button type="submit" disabled={isLoading || !url} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoading ? <><Loader2 size={18} className="animate-spin" /> Loading Data...</> : "Explore"}
                </button>
              )}
            </div>
          </form>

          {history.length > 0 && (
            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center gap-2 mb-3 text-gray-500">
                <History size={14} />
                <span className="text-xs font-semibold uppercase tracking-wider">Recent</span>
              </div>
              <div className="space-y-2">
                {history.map((item, idx) => (
                  <button key={idx} onClick={() => { setUrl(item.url); setError(null); }} className="w-full text-left bg-gray-950/50 hover:bg-gray-800 border border-gray-800 rounded-md p-3 transition-all group">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm text-gray-300 group-hover:text-blue-400 truncate w-3/4">{item.title}</span>
                      <span className="text-[10px] text-gray-600 whitespace-nowrap flex items-center gap-1">
                        <Clock size={10} /> {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={loadSample} disabled={isLoading} className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
            <PlayCircle size={18} className="text-purple-400" /> Load Sample PR
          </button>
        </div>
      </div>
    </div>
  );
};
