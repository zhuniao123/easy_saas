import { useEffect, useState } from 'react';
import PageLoader from './PageLoader';

interface Tab {
  id: string; // pageCode-mode
  title: string;
  pageCode: string;
  mode: 'config' | 'runtime';
}

function App() {
  const [pages, setPages] = useState<any[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Fetch available pages on load
  useEffect(() => {
    fetch('/api/v1/pages')
      .then((res) => res.json())
      .then((data) => {
        setPages(data || []);
      })
      .catch((err) => console.error('Failed to load page listings:', err));
  }, []);

  const openTab = (pageCode: string, title: string, mode: 'config' | 'runtime') => {
    const tabId = `${pageCode}-${mode}`;
    const exists = tabs.find((t) => t.id === tabId);
    if (!exists) {
      const newTab: Tab = {
        id: tabId,
        title: mode === 'config' ? `⚙️ ${title} (Config)` : `📱 ${title}`,
        pageCode,
        mode,
      };
      setTabs([...tabs, newTab]);
    }
    setActiveTabId(tabId);
  };

  const closeTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remainingTabs = tabs.filter((t) => t.id !== tabIdToClose);
    setTabs(remainingTabs);

    if (activeTabId === tabIdToClose) {
      if (remainingTabs.length > 0) {
        setActiveTabId(remainingTabs[remainingTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900 font-sans antialiased text-slate-800">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0">
        {/* Brand header */}
        <div className="px-6 py-5 border-b border-slate-800/60 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white text-lg font-bold shadow-md shadow-indigo-600/30">
            ⚡
          </span>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-tight leading-none">Lowcode Portal</h1>
            <span className="text-[10px] text-slate-400 font-semibold tracking-wider font-mono">ENTERPRISE SPA</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-7">
          {/* Business Pages */}
          <div className="space-y-2">
            <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              🖥️ Business Applications
            </span>
            <div className="space-y-1">
              {pages.length === 0 ? (
                <span className="px-3 text-xs text-slate-500 italic block">No pages configured</span>
              ) : (
                pages.map((p) => (
                  <button
                    key={`runtime-${p.pageCode}`}
                    onClick={() => openTab(p.pageCode, p.title, 'runtime')}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl text-left transition duration-150 cursor-pointer ${
                      activeTab?.pageCode === p.pageCode && activeTab?.mode === 'runtime'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <span>📱</span>
                    <span className="truncate">{p.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Configuration Pages */}
          <div className="space-y-2">
            <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              🛠️ Developer Workspace
            </span>
            <div className="space-y-1">
              {pages.map((p) => (
                <button
                  key={`config-${p.pageCode}`}
                  onClick={() => openTab(p.pageCode, p.title, 'config')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl text-left transition duration-150 cursor-pointer ${
                    activeTab?.pageCode === p.pageCode && activeTab?.mode === 'config'
                      ? 'bg-slate-800 text-indigo-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                  }`}
                >
                  <span>⚙️</span>
                  <span className="truncate">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
              Engine connected
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-900">
        {/* Top tab bar */}
        <header className="h-14 bg-slate-950 border-b border-slate-800/60 flex items-center px-4 overflow-x-auto shrink-0 select-none">
          <div className="flex items-center gap-1.5 h-full">
            {tabs.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                className={`h-9 flex items-center gap-2 px-4 rounded-xl text-xs font-semibold tracking-tight transition duration-150 cursor-pointer select-none border border-transparent ${
                  activeTabId === t.id
                    ? 'bg-slate-900 text-white shadow-md border-slate-800/80'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span>{t.title}</span>
                <button
                  onClick={(e) => closeTab(t.id, e)}
                  className="flex items-center justify-center h-4 w-4 rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition duration-100 cursor-pointer text-[10px] font-bold border-none bg-transparent"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </header>

        {/* Tab Canvas Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {activeTab ? (
            <PageLoader key={activeTab.id} pageCode={activeTab.pageCode} mode={activeTab.mode} />
          ) : (
            /* Welcome landing page when no tabs are open */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 max-w-2xl mx-auto">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-600 text-4xl shadow-inner shadow-indigo-500/5">
                💼
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 bg-clip-text text-transparent">
                  Enterprise Portal Console
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Welcome to the multi-page portal. Switch workspaces using the left sidebar menu. 
                  Open multiple pages to audit layouts, run DDL configurations, and monitor tabular operations concurrently.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full pt-4">
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition text-left space-y-2">
                  <span className="text-lg">🖥️</span>
                  <h4 className="text-sm font-bold text-slate-800">Business Applications</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Preview pages exactly as the business users see them. Only renders table data, filters, and dynamic operations.
                  </p>
                </div>
                <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition text-left space-y-2">
                  <span className="text-lg">🛠️</span>
                  <h4 className="text-sm font-bold text-slate-800">Developer Workspace</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Access deep DDL consoles, edit layout mappings, customize target SQL properties, and run manual raw script queries.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
