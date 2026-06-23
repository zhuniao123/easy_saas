import { useEffect, useState } from 'react';
import PageLoader from './PageLoader';

interface Tab {
  id: string; // pageCode-mode
  title: string;
  pageCode: string;
  mode: 'config' | 'runtime' | 'manager';
}

interface PageManagerConsoleProps {
  pages: any[];
  onPageCreated: () => void;
  onPageDeleted: (pageCode: string) => void;
  openTab: (pageCode: string, title: string, mode: 'config' | 'runtime' | 'manager') => void;
}

function PageManagerConsole({ pages, onPageCreated, onPageDeleted, openTab }: PageManagerConsoleProps) {
  const [pageCode, setPageCode] = useState('');
  const [title, setTitle] = useState('');
  const [routePath, setRoutePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageCode.trim() || !title.trim() || !routePath.trim()) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageCode: pageCode.trim(),
          title: title.trim(),
          routePath: routePath.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to create page');
      }
      setPageCode('');
      setTitle('');
      setRoutePath('');
      onPageCreated();
      // Auto open config tab for the new page
      openTab(pageCode.trim(), title.trim(), 'config');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Page & Schema Manager</h2>
          <p className="text-sm text-slate-500 font-medium">Create new dynamic application pages and coordinate entity bindings</p>
        </div>
        <span className="px-3 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full">SYSTEM CONSOLE</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Creation Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 h-fit">
          <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
            <span>➕</span> Create Page Template
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl font-medium">
                ⚠️ {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block">Page Code (Unique ID)</label>
              <input
                type="text"
                value={pageCode}
                onChange={(e) => setPageCode(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="e.g. employee_list"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                required
              />
              <span className="text-[10px] text-slate-400 block font-medium">Alpha-numeric and underscores only</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block">Page Title (Display Name)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Employee Directory"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 block">Route Path</label>
              <input
                type="text"
                value={routePath}
                onChange={(e) => setRoutePath(e.target.value)}
                placeholder="e.g. /employees"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 rounded-xl transition duration-150 shadow-md shadow-indigo-600/10 cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create Dynamic Page'}
            </button>
          </form>
        </div>

        {/* Existing Pages List */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-6">
          <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
            <span>🗂️</span> Active System Pages ({pages.length})
          </h3>
          {pages.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic text-sm">No dynamic pages configured in database.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-medium text-slate-500">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Title</th>
                    <th className="pb-3">Code</th>
                    <th className="pb-3">Route</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pages.map((p) => (
                    <tr key={p.pageCode} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 font-bold text-slate-800">{p.title}</td>
                      <td className="py-4 font-mono font-semibold">{p.pageCode}</td>
                      <td className="py-4">{p.routePath}</td>
                      <td className="py-4 text-right space-x-2">
                        <button
                          onClick={() => openTab(p.pageCode, p.title, 'config')}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                        >
                          Configure
                        </button>
                        <button
                          onClick={() => openTab(p.pageCode, p.title, 'runtime')}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                        >
                          Launch
                        </button>
                        <button
                          onClick={() => onPageDeleted(p.pageCode)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 transition cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [pages, setPages] = useState<any[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Fetch available pages
  const fetchPages = () => {
    fetch('/api/v1/pages')
      .then((res) => res.json())
      .then((data) => {
        setPages(data || []);
      })
      .catch((err) => console.error('Failed to load page listings:', err));
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const openTab = (pageCode: string, title: string, mode: 'config' | 'runtime' | 'manager') => {
    const tabId = `${pageCode}-${mode}`;
    const exists = tabs.find((t) => t.id === tabId);
    if (!exists) {
      const newTab: Tab = {
        id: tabId,
        title: mode === 'manager' ? `➕ ${title}` : mode === 'config' ? `⚙️ ${title} (Config)` : `📱 ${title}`,
        pageCode,
        mode,
      };
      setTabs([...tabs, newTab]);
    }
    setActiveTabId(tabId);
  };

  const closeTab = (tabIdToClose: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
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

  const handlePageDeleted = async (pageCode: string) => {
    if (!window.confirm(`Are you sure you want to delete page "${pageCode}" and all its configuration bindings?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/pages/${pageCode}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete page');
      }
      fetchPages();
      // Close tabs related to deleted page
      setTabs((prevTabs) => prevTabs.filter((t) => t.pageCode !== pageCode));
      // Reset active tab if it matches one of the closed tabs
      if (activeTabId?.startsWith(`${pageCode}-`)) {
        setActiveTabId(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete page');
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900 font-sans antialiased text-slate-800">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-955 border-r border-slate-800 flex flex-col shrink-0">
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
            <div className="flex items-center justify-between px-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                🛠️ Developer Workspace
              </span>
              <button
                onClick={() => openTab('sys-page-manager', 'Page Manager', 'manager')}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                title="Create New Page"
              >
                ➕ CREATE
              </button>
            </div>
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

              {/* Page manager configuration route */}
              <button
                onClick={() => openTab('sys-page-manager', 'Page Manager', 'manager')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl text-left transition duration-150 cursor-pointer ${
                  activeTab?.pageCode === 'sys-page-manager' && activeTab?.mode === 'manager'
                    ? 'bg-slate-850 text-indigo-400 border border-slate-750'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <span>➕</span>
                <span className="truncate">Page Manager</span>
              </button>
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
            activeTab.mode === 'manager' ? (
              <PageManagerConsole
                pages={pages}
                onPageCreated={fetchPages}
                onPageDeleted={handlePageDeleted}
                openTab={openTab}
              />
            ) : (
              <PageLoader key={activeTab.id} pageCode={activeTab.pageCode} mode={activeTab.mode} />
            )
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
