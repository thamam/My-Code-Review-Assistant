import React, { useState, useEffect } from 'react';
import { Github, Loader2, PlayCircle, AlertCircle, HelpCircle, CheckSquare, Square, History, Database, RefreshCw, Upload, FileJson, Clock, FileText } from 'lucide-react';
import { usePR } from '../contexts/PRContext';
import { GitHubService } from '../services/github';
import { SAMPLE_PR } from '../mock/samplePR';
import { PRData, Walkthrough, PRHistoryItem, WalkthroughSection } from '../types';
import { formatDistanceToNow } from 'date-fns';

export const WelcomeScreen: React.FC = () => {
  const { setPRData, loadWalkthrough } = usePR();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [rememberToken, setRememberToken] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [history, setHistory] = useState<PRHistoryItem[]>([]);
  const [cachedData, setCachedData] = useState<PRData | null>(null);
  const [walkthroughFile, setWalkthroughFile] = useState<Walkthrough | null>(null);
  const [walkthroughFileName, setWalkthroughFileName] = useState<string>('');

  useEffect(() => {
    try {
        const savedToken = localStorage.getItem('vcr_gh_token');
        const savedPref = localStorage.getItem('vcr_remember_pref');

        if (savedToken) {
            setToken(savedToken);
            setRememberToken(true);
        } else if (savedPref !== null) {
            setRememberToken(savedPref === 'true');
        }

        const savedHistory = localStorage.getItem('vcr_history');
        if (savedHistory) {
            setHistory(JSON.parse(savedHistory));
        }
    } catch (e) {
        console.error("LocalStorage access failed", e);
    }
  }, []);

  useEffect(() => {
    const checkCache = async () => {
        if (!url) {
            setCachedData(null);
            return;
        }
        try {
            const cacheKey = `vcr_cache_${btoa(url)}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                setCachedData(JSON.parse(cached));
            } else {
                setCachedData(null);
            }
        } catch (e) {
            console.error("Cache check failed", e);
        }
    };
    const timer = setTimeout(checkCache, 300);
    return () => clearTimeout(timer);
  }, [url]);

  const saveToHistory = (data: PRData, prUrl: string) => {
    try {
        const newItem: PRHistoryItem = {
            id: data.id,
            title: data.title,
            url: prUrl,
            author: data.author,
            timestamp: Date.now()
        };

        const newHistory = [newItem, ...history.filter(h => h.url !== prUrl)].slice(0, 5);
        setHistory(newHistory);
        localStorage.setItem('vcr_history', JSON.stringify(newHistory));
    } catch (e) {
        console.warn("Failed to save history", e);
    }
  };

  const saveToCache = (data: PRData, prUrl: string) => {
      try {
        const cacheKey = `vcr_cache_${btoa(prUrl)}`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (e) {
          console.warn("Failed to save to cache", e);
      }
  };

  const parseMarkdownWalkthrough = (text: string): Walkthrough => {
    const lines = text.split('\n');
    let title = "Walkthrough";
    let author = "Anonymous";
    const sections: WalkthroughSection[] = [];
    
    let currentSection: any = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('# ')) {
            title = line.substring(2).trim();
        } else if (line.toLowerCase().startsWith('author:')) {
            author = line.substring(7).trim();
        } else if (line.startsWith('## ')) {
            if (currentSection) sections.push(currentSection);
            currentSection = {
                id: `sec-${sections.length + 1}`,
                title: line.substring(3).trim(),
                files: [],
                description: '',
                highlights: []
            };
        } else if (currentSection) {
            if (line.toLowerCase().startsWith('files:')) {
                const filesStr = line.substring(6);
                currentSection.files = filesStr.split(',').map((f: string) => f.trim());
            } else if (line.startsWith('- ') && line.includes(':')) {
                // Expect format: - path/file: start-end: note
                const firstColon = line.indexOf(':');
                if (firstColon > -1) {
                    const file = line.substring(2, firstColon).trim();
                    const rest = line.substring(firstColon + 1).trim();
                    const secondColon = rest.indexOf(':');
                    
                    if (secondColon > -1) {
                        const range = rest.substring(0, secondColon).trim();
                        const note = rest.substring(secondColon + 1).trim();
                        
                        let start = 0, end = 0;
                        if (range.includes('-')) {
                             const parts = range.split('-');
                             start = parseInt(parts[0]);
                             end = parseInt(parts[1]);
                        } else {
                             start = parseInt(range);
                             end = start;
                        }

                        if (!isNaN(start)) {
                            currentSection.highlights.push({ file, lines: [start, end], note });
                            if (!currentSection.files.includes(file)) {
                                currentSection.files.push(file);
                            }
                        } else {
                            currentSection.description += line + '\n';
                        }
                    } else {
                        currentSection.description += line + '\n';
                    }
                } else {
                    currentSection.description += line + '\n';
                }
            } else {
                currentSection.description += line + '\n';
            }
        }
    }
    if (currentSection) sections.push(currentSection);

    return { title, author, sections };
  };

  const handleWalkthroughUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setWalkthroughFileName(file.name);
      const reader = new FileReader();
      
      reader.onload = (event) => {
          const content = event.target?.result as string;
          try {
              if (file.name.endsWith('.json')) {
                  const json = JSON.parse(content);
                  setWalkthroughFile(json as Walkthrough);
                  setError(null);
              } else {
                  // Assume Markdown
                  const parsed = parseMarkdownWalkthrough(content);
                  if (parsed.sections.length === 0) {
                      throw new Error("No sections found in Markdown.");
                  }
                  setWalkthroughFile(parsed);
                  setError(null);
              }
          } catch (err) {
              console.error(err);
              setError("Invalid file format. Please use JSON or valid Markdown.");
              setWalkthroughFile(null);
          }
      };
      reader.readAsText(file);
  };

  const processDataLoad = (data: PRData) => {
      setPRData(data);
      if (walkthroughFile) {
          loadWalkthrough(walkthroughFile);
      }
  };

  const handleLoad = async (e: React.FormEvent | null, forceRefresh: boolean = false) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
        localStorage.setItem('vcr_remember_pref', String(rememberToken));
        if (rememberToken && token.trim()) {
            localStorage.setItem('vcr_gh_token', token.trim());
        } else {
            localStorage.removeItem('vcr_gh_token');
        }
    } catch (e) {
        console.warn("Failed to persist token settings", e);
    }

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
      console.error(err);
      setError(err.message || "Failed to load PR. Check the URL and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSample = () => {
    setPRData(SAMPLE_PR);
  };

  return (
    <div className="min-h-screen w-screen bg-gray-950 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden my-8">
        <div className="p-8 text-center border-b border-gray-800 bg-gray-900">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Github size={32} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Visual Code Review</h1>
          <p className="text-gray-400 text-sm">
            Enter a public GitHub Pull Request URL to visualize changes and get AI-powered insights.
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
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder="https://github.com/owner/repo/pull/123"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>Access Token (Optional)</span>
                <div className="group relative cursor-help">
                  <HelpCircle size={14} className="text-gray-500 hover:text-gray-300" />
                  <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Use a <strong>Classic Token</strong> with <code>repo</code> scope for private repos. For public repos, no scope is needed (just increases rate limit).
                  </div>
                </div>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(null); }}
                placeholder="github_pat_..."
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={isLoading}
              />
              
              <div className="flex items-center mt-3 gap-2">
                <button
                    type="button"
                    onClick={() => setRememberToken(!rememberToken)}
                    className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors group"
                >
                    {rememberToken ? (
                        <CheckSquare size={16} className="text-blue-500" />
                    ) : (
                        <Square size={16} className="text-gray-600 group-hover:text-gray-500" />
                    )}
                    <span className="text-xs">Save token locally</span>
                </button>
              </div>
            </div>

             <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Walkthrough File (Optional)
                 </label>
                 <div className="flex items-center gap-2">
                    <label className={`flex-1 cursor-pointer border border-dashed rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2 group ${
                        walkthroughFileName 
                            ? "bg-purple-900/20 border-purple-500/50" 
                            : "bg-gray-950 border-gray-700 hover:bg-gray-900 hover:border-gray-600"
                    }`}>
                        {walkthroughFileName ? (
                             <FileText size={18} className="text-purple-400" />
                        ) : (
                             <Upload size={18} className="text-gray-500 group-hover:text-purple-400 transition-colors" />
                        )}
                        <span className={`text-sm truncate ${walkthroughFileName ? "text-purple-200" : "text-gray-400 group-hover:text-gray-300"}`}>
                            {walkthroughFileName || "Select Markdown / JSON"}
                        </span>
                        <input 
                            type="file" 
                            accept=".json, .md, .txt" 
                            className="hidden" 
                            onChange={handleWalkthroughUpload}
                        />
                    </label>
                 </div>
                 <p className="text-[10px] text-gray-600 mt-1 ml-1">
                     Loads specific walkthrough context. Supports <code>.md</code> or <code>.json</code>.
                 </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-200 text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <div className="flex gap-2">
                {cachedData ? (
                    <>
                        <button
                            type="button"
                            onClick={() => handleLoad(null, false)}
                            disabled={isLoading}
                            className="flex-1 bg-green-700 hover:bg-green-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                            Load Cached
                        </button>
                        <button
                            type="button"
                            onClick={() => handleLoad(null, true)}
                            disabled={isLoading}
                            className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={18} />
                            Refresh
                        </button>
                    </>
                ) : (
                    <button
                        type="submit"
                        disabled={isLoading || !url}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                            <Loader2 size={18} className="animate-spin" />
                            Loading Data...
                            </>
                        ) : (
                            "Visualize PR"
                        )}
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
                        <button
                            key={idx}
                            onClick={() => { setUrl(item.url); setError(null); }}
                            className="w-full text-left bg-gray-950/50 hover:bg-gray-800 border border-gray-800 rounded-md p-3 transition-all group"
                        >
                            <div className="flex justify-between items-start">
                                <span className="font-medium text-sm text-gray-300 group-hover:text-blue-400 truncate w-3/4">
                                    {item.title}
                                </span>
                                <span className="text-[10px] text-gray-600 whitespace-nowrap flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                                </span>
                            </div>
                            <div className="flex justify-between items-end mt-1">
                                <span className="text-xs text-gray-500 truncate w-3/4">{item.url}</span>
                            </div>
                        </button>
                    ))}
                </div>
             </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-900 px-2 text-gray-500">Or try it out</span>
            </div>
          </div>

          <button
            onClick={loadSample}
            disabled={isLoading}
            className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-300 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <PlayCircle size={18} className="text-purple-400" />
            Load Sample PR
          </button>
        </div>
      </div>
    </div>
  );
};