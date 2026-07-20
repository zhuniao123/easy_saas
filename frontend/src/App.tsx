import { useCallback, useEffect, useMemo, useState } from 'react';
import PageLoader from './PageLoader';
import SqlRepoConsole from './SqlRepoConsole';
import RbacAdminConsole from './RbacAdminConsole';
import LoginScreen from './LoginScreen';
import { clearSession, fetchAuthStatus, fetchMe, getProfile, getToken, logout } from './auth';
import { can, canOpenSystemPage, canPage, canConfig } from './runtime/permissions';
import { createTranslator, getDefaultLocale, type LocaleCode } from './i18n';

interface PageSummary {
  pageCode: string;
  title: string;
  routePath: string;
  queryCode?: string;
  entityCode?: string;
}

type TabMode = 'config' | 'runtime' | 'manager' | 'sqlrepo' | 'rbac';

interface Tab {
  id: string;
  title: string;
  pageCode: string;
  mode: TabMode;
}

interface PageManagerConsoleProps {
  pages: PageSummary[];
  onPageCreated: () => void;
  onPageDeleted: (pageCode: string) => void;
  openTab: (pageCode: string, title: string, mode: TabMode) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const shellButton =
  'rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-white transition hover:border-cyan-300/40 hover:bg-cyan-300/10';

function PageManagerConsole({ pages, onPageCreated, onPageDeleted, openTab, t }: PageManagerConsoleProps) {
  const [pageCode, setPageCode] = useState('');
  const [title, setTitle] = useState('');
  const [routePath, setRoutePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageCode.trim() || !title.trim() || !routePath.trim()) {
      setError(t('app.allFieldsRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageCode: pageCode.trim(),
          title: title.trim(),
          routePath: routePath.trim(),
        }),
      });
      if (!res.ok) throw new Error(t('app.failedToCreatePage'));
      onPageCreated();
      openTab(pageCode.trim(), title.trim(), 'config');
      setPageCode('');
      setTitle('');
      setRoutePath('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('app.somethingWentWrong');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_26%),linear-gradient(160deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_30px_90px_rgba(2,6,23,0.42)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200">{t('app.factoryBadge')}</div>
            <h2 className="text-4xl font-semibold tracking-[-0.05em] text-white">
              {t('app.factoryTitle')}
            </h2>
            <p className="text-sm leading-7 text-slate-300">
              {t('app.factoryDescription')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-left text-xs">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-400">{t('app.pages')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{pages.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-400">{t('app.mode')}</div>
              <div className="mt-2 text-sm font-semibold text-cyan-200">{t('app.modeValue')}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-400">{t('app.target')}</div>
              <div className="mt-2 text-sm font-semibold text-amber-200">{t('app.targetValue')}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]"
        >
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('app.createPage')}</div>
            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t('app.createPageTitle')}</h3>
            <p className="text-sm leading-7 text-slate-500">
              {t('app.createPageDescription')}
            </p>
          </div>

          {error && <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <div className="mt-6 space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t('app.pageCode')}</span>
              <input
                value={pageCode}
                onChange={(e) => setPageCode(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="orders_liveboard"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t('app.title')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Orders Liveboard"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t('app.routePath')}</span>
              <input
                value={routePath}
                onChange={(e) => setRoutePath(e.target.value)}
                placeholder="/orders/liveboard"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                required
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{t('app.rawSqlDriven')}</div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-slate-950 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? t('app.creating') : t('app.createPageAction')}
            </button>
          </div>
        </form>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('app.currentWorkspaces')}</div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t('app.currentWorkspacesTitle')}</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {pages.length} {t('app.active')}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {pages.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                {t('app.noPages')}
              </div>
            ) : (
              pages.map((page) => (
                <div
                  key={page.pageCode}
                  className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] p-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-semibold text-slate-950">{page.title}</h4>
                      <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                        {page.pageCode}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">{page.routePath}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openTab(page.pageCode, page.title, 'runtime')} className={shellButton}>
                      {t('app.launchRuntime')}
                    </button>
                    <button onClick={() => openTab(page.pageCode, page.title, 'config')} className={shellButton}>
                      {t('app.openConfig')}
                    </button>
                    <button
                      onClick={() => onPageDeleted(page.pageCode)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                    >
                      {t('app.delete')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}



export type ThemeCode = 'ocean-dark' | 'cyberpunk' | 'solarized' | 'emerald';

const THEMES = {
  'ocean-dark': {
    aside: 'bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_30%),linear-gradient(180deg,#020617,#0f172a)] border-white/10 text-slate-100',
    main: 'bg-[linear-gradient(180deg,#e2e8f0,#f8fafc_28%,#eef2ff)] text-slate-900',
    header: 'border-b border-slate-200/80 bg-white/80 backdrop-blur text-slate-800',
    tabActive: 'border-slate-950 bg-slate-950 text-white',
    tabInactive: 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700',
    btnAccent: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
    logoIcon: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    textMuted: 'text-slate-400',
    inputSearch: 'bg-white/5 border-white/10 text-white placeholder-slate-500 focus:border-cyan-400/40 focus:bg-white/10',
    folderIcon: 'text-cyan-400/80',
    navItemActive: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
    navItemInactive: 'border-transparent hover:bg-white/5 text-slate-300 hover:text-white',
    card: 'bg-white/5 border-white/10',
    badge: 'bg-cyan-300/10 text-cyan-100 border-cyan-300/20',
  },
  'cyberpunk': {
    aside: 'bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.15),_transparent_40%),linear-gradient(180deg,#0d001a,#03000a)] border-fuchsia-500/20 text-slate-100',
    main: 'bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.08),_transparent_30%),linear-gradient(180deg,#080014,#020006)] text-slate-100',
    header: 'border-b border-fuchsia-500/20 bg-[#090514]/85 backdrop-blur text-slate-200',
    tabActive: 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_15px_rgba(236,72,153,0.35)]',
    tabInactive: 'border-slate-800 bg-[#03000a]/50 text-slate-400 hover:border-fuchsia-500/40 hover:text-fuchsia-400',
    btnAccent: 'bg-fuchsia-500 text-white hover:bg-fuchsia-400 shadow-[0_0_15px_rgba(236,72,153,0.4)]',
    logoIcon: 'border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100',
    textMuted: 'text-slate-400',
    inputSearch: 'bg-white/5 border-fuchsia-500/20 text-white placeholder-slate-500 focus:border-fuchsia-400/40 focus:bg-white/10',
    folderIcon: 'text-fuchsia-400/80',
    navItemActive: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-300 shadow-[0_0_10px_rgba(236,72,153,0.15)]',
    navItemInactive: 'border-transparent hover:bg-white/5 text-slate-400 hover:text-fuchsia-400',
    card: 'bg-fuchsia-950/20 border-fuchsia-500/20',
    badge: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/20',
  },
  'solarized': {
    aside: 'bg-gradient-to-b from-[#eee8d5] to-[#e4dcd3] border-amber-800/10 text-amber-950',
    main: 'bg-gradient-to-b from-[#fdf6e3] to-[#eee8d5] text-amber-900',
    header: 'border-b border-amber-800/10 bg-[#fdf6e3]/90 backdrop-blur text-amber-950',
    tabActive: 'border-teal-600 bg-teal-600 text-white',
    tabInactive: 'border-amber-800/15 bg-[#eee8d5]/40 text-amber-800 hover:border-teal-500/50 hover:text-teal-600',
    btnAccent: 'bg-teal-600 text-white hover:bg-teal-500',
    logoIcon: 'border-teal-600/20 bg-teal-600/10 text-teal-800',
    textMuted: 'text-amber-800/70',
    inputSearch: 'bg-amber-950/5 border-amber-800/20 text-amber-950 placeholder-amber-800/50 focus:border-teal-600/40 focus:bg-amber-950/10',
    folderIcon: 'text-teal-600',
    navItemActive: 'border-teal-600/20 bg-teal-600/10 text-teal-800',
    navItemInactive: 'border-transparent hover:bg-amber-950/5 text-amber-800/80 hover:text-teal-700',
    card: 'bg-amber-950/5 border-amber-800/10',
    badge: 'bg-teal-600/10 text-teal-800 border-teal-600/20',
  },
  'emerald': {
    aside: 'bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.08),_transparent_35%),linear-gradient(180deg,#022c22,#064e3b)] border-emerald-500/10 text-slate-100',
    main: 'bg-gradient-to-b from-[#f0fdf4] to-[#dcfce7] text-slate-900',
    header: 'border-b border-emerald-500/10 bg-white/80 backdrop-blur text-slate-800',
    tabActive: 'border-emerald-700 bg-emerald-700 text-white',
    tabInactive: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-600 hover:text-emerald-700',
    btnAccent: 'bg-emerald-600 text-white hover:bg-emerald-500',
    logoIcon: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    textMuted: 'text-emerald-200/60',
    inputSearch: 'bg-white/5 border-emerald-500/20 text-white placeholder-emerald-300/50 focus:border-emerald-400/40 focus:bg-white/10',
    folderIcon: 'text-emerald-400/80',
    navItemActive: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    navItemInactive: 'border-transparent hover:bg-white/5 text-slate-300 hover:text-emerald-300',
    card: 'bg-emerald-950/10 border-emerald-500/10',
    badge: 'bg-emerald-300/10 text-emerald-100 border-emerald-300/20',
  },
};

function App() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const [locale, setLocale] = useState<LocaleCode>(() => getDefaultLocale());
  const [theme, setTheme] = useState<ThemeCode>(() => {
    return (localStorage.getItem('easy_saas_theme') as ThemeCode) || 'ocean-dark';
  });

  const t = useMemo(() => createTranslator(locale), [locale]);
  const s = THEMES[theme];
  const isThemeDark = theme === 'ocean-dark' || theme === 'cyberpunk' || theme === 'emerald';

  const handleLocaleChange = (newLocale: LocaleCode) => {
    setLocale(newLocale);
    localStorage.setItem('easy_saas_locale', newLocale);
  };

  const handleThemeChange = (newTheme: ThemeCode) => {
    setTheme(newTheme);
    localStorage.setItem('easy_saas_theme', newTheme);
  };

  const fetchPages = useCallback(() => {
    return fetch('/api/v1/pages')
      .then((res) => {
        if (res.status === 401) {
          clearSession();
          setAuthed(false);
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(t('app.failedToFetchPages'));
        return res.json();
      })
      .then((data) => setPages(data || []))
      .catch((err) => console.error(t('app.failedToLoadPageListings'), err));
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        setAuthEnabled(status.enabled);
        if (!status.enabled) {
          setAuthed(true);
          setAuthReady(true);
          return;
        }
        if (!getToken()) {
          setAuthed(false);
          setAuthReady(true);
          return;
        }
        const me = await fetchMe();
        if (cancelled) return;
        setDisplayName(me.displayName || me.loginName || '');
        setAuthed(true);
      } catch {
        if (!cancelled) {
          clearSession();
          setAuthed(false);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authReady && authed) {
      void fetchPages();
    }
  }, [authReady, authed, fetchPages]);

  const openTab = (pageCode: string, title: string, mode: TabMode) => {
    if (mode === 'manager' && !canOpenSystemPage('sys-page-manager')) {
      return;
    }
    if (mode === 'sqlrepo' && !canOpenSystemPage('sys-sql-repo')) {
      return;
    }
    if (mode === 'rbac' && !canOpenSystemPage('sys-rbac')) {
      return;
    }
    if ((mode === 'runtime' || mode === 'config') && pageCode && !pageCode.startsWith('sys-') && !canPage(pageCode)) {
      return;
    }
    if (mode === 'config' && !canConfig()) {
      return;
    }
    const tabId = `${pageCode}-${mode}`;
    setTabs((prev) => {
      if (prev.some((tab) => tab.id === tabId)) return prev;
      const nextTitle =
        mode === 'manager'
          ? t('app.factoryTab')
          : mode === 'sqlrepo'
            ? 'SQL Repository'
            : mode === 'rbac'
              ? '权限管理'
              : mode === 'config'
                ? t('app.configTab', { title })
                : t('app.runtimeTab', { title });
      return [...prev, { id: tabId, title: nextTitle, pageCode, mode }];
    });
    setActiveTabId(tabId);
    if (mode === 'manager' || mode === 'sqlrepo' || mode === 'rbac') {
      setIsCollapsed(false);
    } else {
      setIsCollapsed(true);
    }
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const nextActiveTab = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
        setActiveTabId(nextActiveTab ? nextActiveTab.id : null);
        if (!nextActiveTab) {
          setIsCollapsed(false);
        } else if (
          nextActiveTab.mode === 'manager' ||
          nextActiveTab.mode === 'sqlrepo' ||
          nextActiveTab.mode === 'rbac'
        ) {
          setIsCollapsed(false);
        } else {
          setIsCollapsed(true);
        }
      }
      return nextTabs;
    });
  };

  const handlePageDeleted = async (pageCode: string) => {
    if (!window.confirm(t('app.deletePageConfirm', { pageCode }))) return;
    try {
      const res = await fetch(`/api/v1/pages/${pageCode}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('app.failedToDeletePage'));
      fetchPages();
      setTabs((prev) => prev.filter((tab) => tab.pageCode !== pageCode));
      if (activeTabId?.startsWith(`${pageCode}-`)) {
        setActiveTabId(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('app.failedToDeletePage');
      window.alert(message);
    }
  };

  const getCategory = (routePath: string) => {
    const cleanPath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
    const parts = cleanPath.split('/');
    if (parts.length > 0 && parts[0]) {
      const segment = parts[0].split('-')[0];
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    }
    return 'General';
  };

  const groupedPages = useMemo(() => {
    const filtered = pages.filter((page) => {
      const query = searchQuery.toLowerCase();
      return (
        page.title.toLowerCase().includes(query) ||
        page.pageCode.toLowerCase().includes(query) ||
        page.routePath.toLowerCase().includes(query)
      );
    });

    const groups: Record<string, PageSummary[]> = {};
    filtered.forEach((page) => {
      const category = getCategory(page.routePath);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(page);
    });
    return groups;
  }, [pages, searchQuery]);

  const locateActiveItem = () => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab || activeTab.mode === 'manager') return;
    const page = pages.find((p) => p.pageCode === activeTab.pageCode);
    if (page) {
      const category = getCategory(page.routePath);
      setExpandedFolders((prev) => ({ ...prev, [category]: true }));
      setTimeout(() => {
        const el = document.getElementById(`nav-item-${page.pageCode}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('bg-cyan-500/20');
          setTimeout(() => el.classList.remove('bg-cyan-500/20'), 1500);
        }
      }, 100);
    }
  };

  useEffect(() => {
    if (activeTabId && !isCollapsed) {
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      if (activeTab && activeTab.mode !== 'manager') {
        const page = pages.find((p) => p.pageCode === activeTab.pageCode);
        if (page) {
          const category = getCategory(page.routePath);
          setExpandedFolders((prev) => {
            if (prev[category]) return prev;
            return { ...prev, [category]: true };
          });
        }
      }
    }
  }, [activeTabId, tabs, pages, isCollapsed]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  const showFactory = canOpenSystemPage('sys-page-manager');
  const showSqlRepo = canOpenSystemPage('sys-sql-repo');
  const showRbac = canOpenSystemPage('sys-rbac');

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading…
      </div>
    );
  }

  if (authEnabled && !authed) {
    return (
      <LoginScreen
        onLoggedIn={() => {
          const p = getProfile();
          setDisplayName(p?.displayName || p?.loginName || '');
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${isThemeDark ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <aside className={`relative hidden shrink-0 border-r h-full overflow-hidden transition-all duration-300 ease-in-out xl:flex xl:flex-col ${
        isCollapsed ? 'w-[80px]' : 'w-[320px]'
      } ${s.aside}`}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`absolute -right-3 top-8 z-50 flex h-6 w-6 items-center justify-center rounded-full border transition focus:outline-none ${
            isThemeDark
              ? 'border-white/10 bg-slate-900 text-slate-400 hover:text-white hover:border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
              : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-teal-500 shadow-[0_0_10px_rgba(0,0,0,0.05)]'
          }`}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>

        <div className={`border-b py-7 transition-all duration-300 ${
          isThemeDark ? 'border-white/10' : 'border-slate-900/10'
        } ${
          isCollapsed ? 'px-4 flex justify-center' : 'px-7'
        }`}>
          <div className="inline-flex items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-lg font-semibold ${s.logoIcon}`}>
              ES
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <div className={`text-2xl font-semibold tracking-[-0.04em] ${isThemeDark ? 'text-white' : 'text-slate-900'}`}>
                  easy_saas
                </div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.32em] ${s.textMuted}`}>
                  {t('app.sqlDrivenApplications')}
                </div>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <p className={`mt-5 text-sm leading-7 ${s.textMuted}`}>
              {t('app.sidebarDescription')}
            </p>
          )}
          {!isCollapsed && authed && (
            <div className={`mt-4 flex items-center justify-between gap-2 text-xs ${s.textMuted}`}>
              <span className="truncate">{displayName || getProfile()?.loginName || 'user'}</span>
              {authEnabled && (
                <button
                  type="button"
                  className="rounded-full border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] hover:bg-white/10"
                  onClick={async () => {
                    await logout();
                    setAuthed(false);
                    setTabs([]);
                    setActiveTabId(null);
                    setPages([]);
                  }}
                >
                  Logout
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search positioning box */}
        {!isCollapsed && (
          <div className="px-6 pt-5 pb-1">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg className={`h-4 w-4 ${isThemeDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pages..."
                  className={`w-full rounded-xl border py-2 pl-9 pr-8 text-xs focus:outline-none transition-all ${s.inputSearch}`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`absolute inset-y-0 right-0 flex items-center pr-2.5 text-sm ${isThemeDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={locateActiveItem}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                  isThemeDark
                    ? 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-400/40 hover:text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-teal-500/50 hover:text-teal-700'
                }`}
                title="Locate Active Tab"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto py-4 transition-all duration-300 ${
          isCollapsed ? 'px-3' : 'px-6'
        }`}>
          {isCollapsed ? (
            <div className="space-y-3 flex flex-col items-center">
              {showFactory && (
              <button
                onClick={() => openTab('sys-page-manager', 'Factory', 'manager')}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  isThemeDark
                    ? 'border-white/10 bg-white/5 hover:border-cyan-300/40 hover:bg-cyan-300/10'
                    : 'border-slate-200 bg-white hover:border-teal-500/40 hover:bg-slate-50'
                }`}
                title={t('app.openFactory')}
              >
                <svg className={`h-5 w-5 transition-colors ${isThemeDark ? 'text-slate-400 group-hover:text-cyan-200' : 'text-slate-500 group-hover:text-teal-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              )}
              {showSqlRepo && (
              <button
                onClick={() => openTab('sys-sql-repo', 'SQL Repository', 'sqlrepo')}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  isThemeDark
                    ? 'border-cyan-300/30 bg-cyan-300/10 hover:border-cyan-300/50'
                    : 'border-teal-500/30 bg-teal-50 hover:border-teal-500/50'
                }`}
                title="SQL Repository"
              >
                <span className={`text-[10px] font-bold ${isThemeDark ? 'text-cyan-100' : 'text-teal-800'}`}>SQL</span>
              </button>
              )}
              {showRbac && (
              <button
                onClick={() => openTab('sys-rbac', '权限管理', 'rbac')}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  isThemeDark
                    ? 'border-violet-300/30 bg-violet-300/10 hover:border-violet-300/50'
                    : 'border-violet-500/30 bg-violet-50 hover:border-violet-500/50'
                }`}
                title="权限管理"
              >
                <span className={`text-[10px] font-bold ${isThemeDark ? 'text-violet-100' : 'text-violet-800'}`}>RBAC</span>
              </button>
              )}

              {pages.map((page) => {
                const isActive = activeTabId?.startsWith(`${page.pageCode}-`);
                return (
                  <div key={page.pageCode} className="group relative flex flex-col items-center">
                    <button
                      onClick={() => openTab(page.pageCode, page.title, 'runtime')}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border font-semibold transition ${
                        isActive
                          ? isThemeDark
                            ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
                            : 'border-teal-600 bg-teal-600/10 text-teal-800'
                          : isThemeDark
                            ? 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300/40 hover:bg-white/10'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-500/40 hover:bg-slate-100'
                      }`}
                      title={`${page.title} (Runtime)`}
                    >
                      {page.title.charAt(0).toUpperCase()}
                    </button>
                    <div className={`absolute left-[54px] top-0 z-50 hidden w-48 rounded-2xl border p-2 group-hover:block shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${
                      isThemeDark ? 'border-white/10 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-900'
                    }`}>
                      <div className={`px-3 py-1.5 text-xs font-semibold border-b truncate ${isThemeDark ? 'border-white/10 text-white' : 'border-slate-100 text-slate-900'}`}>
                        {page.title}
                      </div>
                      <div className="p-1 space-y-1">
                        <button
                          onClick={() => openTab(page.pageCode, page.title, 'runtime')}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${isThemeDark ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        >
                          Launch Runtime
                        </button>
                        <button
                          onClick={() => openTab(page.pageCode, page.title, 'config')}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${isThemeDark ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        >
                          Configure Page
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${s.textMuted}`}>{t('app.workspaceTabs')}</div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {showRbac && (
                  <button
                    onClick={() => openTab('sys-rbac', '权限管理', 'rbac')}
                    className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] transition ${
                      isThemeDark
                        ? 'border-violet-300/30 bg-violet-300/10 text-violet-100 hover:border-violet-300/50'
                        : 'border-violet-500/30 bg-violet-50 text-violet-800 hover:border-violet-500/50'
                    }`}
                  >
                    权限
                  </button>
                  )}
                  {showSqlRepo && (
                  <button
                    onClick={() => openTab('sys-sql-repo', 'SQL Repository', 'sqlrepo')}
                    className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] transition ${
                      isThemeDark
                        ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:border-cyan-300/50'
                        : 'border-teal-500/30 bg-teal-50 text-teal-800 hover:border-teal-500/50'
                    }`}
                  >
                    SQL Repo
                  </button>
                  )}
                  {showFactory && (
                  <button
                    onClick={() => openTab('sys-page-manager', 'Factory', 'manager')}
                    className={`rounded-full border px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] transition ${
                      isThemeDark
                        ? 'border-white/10 bg-white/5 text-white hover:border-cyan-300/40 hover:bg-cyan-300/10'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-teal-500/40 hover:bg-slate-50'
                    }`}
                  >
                    {t('app.openFactory')}
                  </button>
                  )}
                </div>
              </div>

              {Object.keys(groupedPages).length === 0 ? (
                <div className={`text-center text-xs py-4 ${s.textMuted}`}>No pages found</div>
              ) : (
                Object.entries(groupedPages).map(([category, items]) => {
                  const isExpanded = expandedFolders[category] !== false;
                  return (
                    <div key={category} className="space-y-2">
                      <button
                        onClick={() =>
                          setExpandedFolders((prev) => ({
                            ...prev,
                            [category]: !isExpanded,
                          }))
                        }
                        className={`flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
                          isThemeDark ? 'text-slate-400 hover:bg-white/5 hover:text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className={`h-4 w-4 ${s.folderIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="tracking-wide">{category}</span>
                          <span className={`rounded-full px-1.5 py-0.2 text-[9px] ${
                            isThemeDark ? 'bg-white/5 text-slate-500' : 'bg-slate-200/60 text-slate-500'
                          }`}>{items.length}</span>
                        </div>
                        <svg
                          className={`h-3 w-3 transition-transform ${isThemeDark ? 'text-slate-500' : 'text-slate-400'} ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className={`ml-2 pl-3 border-l space-y-1.5 ${isThemeDark ? 'border-white/5' : 'border-slate-900/5'}`}>
                          {items.map((page) => {
                            const isActive = activeTabId?.startsWith(`${page.pageCode}-`);
                            return (
                              <div
                                key={page.pageCode}
                                id={`nav-item-${page.pageCode}`}
                                className={`group relative flex items-center justify-between rounded-xl border px-3 py-2 transition-all duration-300 ${
                                  isActive
                                    ? s.navItemActive
                                    : s.navItemInactive
                                }`}
                              >
                                <div
                                  onClick={() => openTab(page.pageCode, page.title, 'runtime')}
                                  className="min-w-0 flex-1 cursor-pointer"
                                >
                                  <div className="truncate text-xs font-semibold">
                                    {page.title}
                                  </div>
                                  <div className={`mt-0.5 truncate text-[10px] font-medium ${
                                    isThemeDark ? 'text-slate-500' : 'text-slate-500/80'
                                  }`}>
                                    {page.routePath}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openTab(page.pageCode, page.title, 'runtime')}
                                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 transition-all"
                                    title="Launch Runtime"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => openTab(page.pageCode, page.title, 'config')}
                                    className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${
                                      isThemeDark ? 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:text-cyan-200' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-teal-500 hover:text-teal-700'
                                    }`}
                                    title="Configure Page"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Theme & Language Selectors */}
        {!isCollapsed && (
          <div className={`border-t px-6 py-4 space-y-3.5 transition-all ${isThemeDark ? 'border-white/10' : 'border-slate-900/10'}`}>
            {/* Language Selector */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-[0.2em] block ${isThemeDark ? 'text-slate-500' : 'text-slate-500/80'}`}>
                {t('locale.switch')}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleLocaleChange('zh-CN')}
                  className={`flex-1 rounded-xl border py-1 text-xs font-semibold transition ${
                    locale === 'zh-CN'
                      ? isThemeDark
                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.15)]'
                        : 'border-teal-600 bg-teal-600/10 text-teal-800 shadow-[0_0_10px_rgba(20,110,120,0.1)]'
                      : isThemeDark
                        ? 'border-white/5 bg-white/5 text-slate-400 hover:border-white/15 hover:text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  中文
                </button>
                <button
                  onClick={() => handleLocaleChange('en-US')}
                  className={`flex-1 rounded-xl border py-1 text-xs font-semibold transition ${
                    locale === 'en-US'
                      ? isThemeDark
                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.15)]'
                        : 'border-teal-600 bg-teal-600/10 text-teal-800 shadow-[0_0_10px_rgba(20,110,120,0.1)]'
                      : isThemeDark
                        ? 'border-white/5 bg-white/5 text-slate-400 hover:border-white/15 hover:text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Theme Selector */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-[0.2em] block ${isThemeDark ? 'text-slate-500' : 'text-slate-500/80'}`}>
                {t('theme.switch')}
              </label>
              <select
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as ThemeCode)}
                className={`w-full rounded-xl border px-3 py-1.5 text-xs font-medium focus:outline-none transition-all cursor-pointer ${
                  isThemeDark
                    ? 'border-white/10 bg-slate-900 text-slate-300 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30'
                    : 'border-slate-200 bg-white text-slate-800 focus:border-teal-600/40 focus:ring-1 focus:ring-teal-600/30'
                }`}
              >
                <option value="ocean-dark">{t('theme.ocean-dark')}</option>
                <option value="cyberpunk">{t('theme.cyberpunk')}</option>
                <option value="solarized">{t('theme.solarized')}</option>
                <option value="emerald">{t('theme.emerald')}</option>
              </select>
            </div>
          </div>
        )}

        <div className={`border-t py-5 transition-all duration-300 ${
          isThemeDark ? 'border-white/10' : 'border-slate-900/10'
        } ${
          isCollapsed ? 'px-4 flex justify-center' : 'px-6'
        }`}>
          {isCollapsed ? (
            <div className="relative flex h-3 w-3" title="Engine Connected">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
          ) : (
            <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs ${
              isThemeDark
                ? 'border-emerald-400/20 bg-emerald-400/10'
                : 'border-emerald-500/20 bg-emerald-50/50'
            }`}>
              <span className={`font-semibold uppercase tracking-[0.22em] ${isThemeDark ? 'text-emerald-200' : 'text-emerald-800'}`}>Engine state</span>
              <span className={`rounded-full px-2 py-1 font-semibold ${isThemeDark ? 'bg-emerald-300/20 text-emerald-100' : 'bg-emerald-100 text-emerald-800'}`}>Connected</span>
            </div>
          )}
        </div>
      </aside>

      <main className={`flex min-w-0 flex-1 flex-col h-full overflow-hidden transition-colors duration-300 ${s.main}`}>
        <header className={`sticky top-0 z-30 border-b transition-colors duration-300 ${s.header}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openTab('sys-page-manager', 'Factory', 'manager')}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition xl:hidden ${
                isThemeDark ? 'bg-slate-100 text-slate-900 hover:bg-white' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {t('app.openFactory')}
            </button>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  if (tab.mode === 'manager' || tab.mode === 'sqlrepo' || tab.mode === 'rbac') {
                    setIsCollapsed(false);
                  } else {
                    setIsCollapsed(true);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  activeTabId === tab.id
                    ? s.tabActive
                    : s.tabInactive
                }`}
              >
                <span>{tab.title}</span>
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    activeTabId === tab.id
                      ? 'bg-current/10'
                      : isThemeDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab ? (
            activeTab.mode === 'manager' ? (
              <PageManagerConsole
                pages={pages}
                onPageCreated={fetchPages}
                onPageDeleted={handlePageDeleted}
                openTab={openTab}
                t={t}
              />
            ) : activeTab.mode === 'sqlrepo' ? (
              <SqlRepoConsole />
            ) : activeTab.mode === 'rbac' ? (
              <RbacAdminConsole />
            ) : (
              <PageLoader key={`${activeTab.id}-${locale}-${theme}`} pageCode={activeTab.pageCode} mode={activeTab.mode} />
            )
          ) : (
            <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
              <section className="overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.28),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.18),_transparent_20%),linear-gradient(150deg,#020617,#0f172a_48%,#111827)] p-8 text-white shadow-[0_40px_120px_rgba(2,6,23,0.36)] md:p-10">
                <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100">
                      {t('app.stageOneShowcase')}
                    </div>
                    <div className="space-y-4">
                      <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-white md:text-6xl">
                        {t('app.heroTitle')}
                      </h1>
                      <p className="max-w-2xl text-base leading-8 text-slate-300">
                        {t('app.heroDescription')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => openTab('sys-page-manager', 'Factory', 'manager')}
                        className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${s.btnAccent}`}
                      >
                        {t('app.openPageFactory')}
                      </button>
                      {pages[0] && (
                        <button
                          onClick={() => openTab(pages[0].pageCode, pages[0].title, 'runtime')}
                          className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-cyan-300/40 hover:bg-white/20"
                        >
                          {t('app.launchFirstRuntime')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{t('app.pages')}</div>
                        <div className="mt-2 text-3xl font-semibold text-white">{pages.length}</div>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{t('app.openTabs')}</div>
                        <div className="mt-2 text-3xl font-semibold text-white">{tabs.length}</div>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{t('app.theme')}</div>
                        <div className="mt-2 text-sm font-semibold text-amber-200">{t('theme.' + theme)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

