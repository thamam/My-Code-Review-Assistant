
import React, { useState, useEffect, useCallback } from 'react';
import { Github, Loader2, PlayCircle, AlertCircle, HelpCircle, CheckSquare, Square, History, Database, RefreshCw, Upload, FileText, Clock, FileJson, Sparkles } from 'lucide-react';
import { usePR } from '../contexts/PRContext';
import { GitHubService } from '../services/github';
import { SAMPLE_PR, SAMPLE_WALKTHROUGH } from '../mock/samplePR';
import { PRData, Walkthrough, PRHistoryItem } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { parseWalkthroughFile, parseWalkthroughFromText } from '../services/walkthroughParser';

const USER_CONFIG = {
  GITHUB_TOKEN: import.meta.env.VITE_GITHUB_TOKEN || '',
  DEFAULT_PR_URL: import.meta.env.VITE_DEFAULT_PR_URL || '',
  DEFAULT_WALKTHROUGH_PATH: import.meta.env.VITE_DEFAULT_WALKTHROUGH_PATH || ''
};

export const WelcomeScreen: React.FC = () => {
  const { setPRData, loadWalkthrough } = usePR();

  const [url, setUrl] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('pr')) return params.get('pr') || '';
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

  const [token, setToken] = useState(() => {
    try {
      if (USER_CONFIG.GITHUB_TOKEN) return USER_CONFIG.GITHUB_TOKEN;
      return localStorage.getItem('vcr_gh_token') || sessionStorage.getItem('vcr_gh_token') || '';
    } catch { return ''; }
  });

  const [history, setHistory] = useState<PRHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('vcr_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

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
    try {
      if (rememberToken) localStorage.setItem('vcr_gh_token', newValue);
      else sessionStorage.setItem('vcr_gh_token', newValue);
    } catch { }
  };

  const toggleRemember = () => {
    const newState = !rememberToken;
    setRememberToken(newState);
    try {
      localStorage.setItem('vcr_remember_pref', String(newState));
      if (newState) {
        localStorage.setItem('vcr_gh_token', token);
        sessionStorage.removeItem('vcr_gh_token');
      } else {
        localStorage.removeItem('vcr_gh_token');
        if (token) sessionStorage.setItem('vcr_gh_token', token);
      }
    } catch { }
  };

  useEffect(() => {
    const checkCache = async () => {
      if (!url) { setCachedData(null); return; }
      try {
        const cacheKey = `vcr_cache_${btoa(url)}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) setCachedData(JSON.parse(cached));
        else setCachedData(null);
      } catch (e) { console.error("Cache check failed", e); }
    };
    const timer = setTimeout(checkCache, 300);
    return () => clearTimeout(timer);
  }, [url]);

  const saveToHistory = (data: PRData, prUrl: string) => {
    try {
      const newItem: PRHistoryItem = {
        id: data.id, title: data.title, url: prUrl, author: data.author, timestamp: Date.now()
      };
      const newHistory = [newItem, ...history.filter(h => h.url !== prUrl)].slice(0, 5);
      setHistory(newHistory);
      localStorage.setItem('vcr_history', JSON.stringify(newHistory));
    } catch (e) { console.warn("Failed to save history", e); }
  };

  const saveToCache = (data: PRData, prUrl: string) => {
    try {
      const cacheKey = `vcr_cache_${btoa(prUrl)}`;
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) { console.warn("Failed to save to cache", e); }
  };

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
    setIsLoading(true);
    setError(null);
    try {
      if (!forceRefresh && cachedData) {
        processDataLoad(cachedData);
        saveToHistory(cachedData, url);
        return;
      }
      const service = new GitHubService(token.trim() || undefined);
      const data = await service.fetchPR(url);
      saveToCache(data, url);
      saveToHistory(data, url);
      processDataLoad(data);
    } catch (err: any) {
      setError(err.message || "Failed to load PR.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSample = () => {
    setPRData(SAMPLE_PR);
    loadWalkthrough(SAMPLE_WALKTHROUGH);
  };

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
                GitHub PR URL
              </label>
              <input
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="https://github.com/owner/repo/pull/123"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={isLoading}
              />
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
                placeholder={USER_CONFIG.GITHUB_TOKEN ? "Loaded from userConfig.ts" : "github_pat_..."}
                className={`w-full bg-gray-950 border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors ${USER_CONFIG.GITHUB_TOKEN ? 'border-green-900 text-green-400' : 'border-gray-700'}`}
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
                  {isLoading ? <><Loader2 size={18} className="animate-spin" /> Loading Data...</> : "Visualize PR"}
                </button>
              )}
            </div>
          </form>

          {history.length > 0 && (
            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center gap-2 mb-3 text-gray-500">
                <History size={14} />
                <span className="text-xs font-semibold uppercase tracking-wider">Recent PRs</span>
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
