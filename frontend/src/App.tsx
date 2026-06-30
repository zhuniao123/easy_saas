import { useCallback, useEffect, useMemo, useState } from 'react';
import PageLoader from './PageLoader';
import { createTranslator, getDefaultLocale } from './i18n';

interface PageSummary {
  pageCode: string;
  title: string;
  routePath: string;
  queryCode?: string;
  entityCode?: string;
}

interface Tab {
  id: string;
  title: string;
  pageCode: string;
  mode: 'config' | 'runtime' | 'manager';
}

interface PageManagerConsoleProps {
  pages: PageSummary[];
  onPageCreated: () => void;
  onPageDeleted: (pageCode: string) => void;
  openTab: (pageCode: string, title: string, mode: 'config' | 'runtime' | 'manager') => void;
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

function App() {
  const t = useMemo(() => createTranslator(getDefaultLocale()), []);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const fetchPages = useCallback(() => {
    return fetch('/api/v1/pages')
      .then((res) => {
        if (!res.ok) throw new Error(t('app.failedToFetchPages'));
        return res.json();
      })
      .then((data) => setPages(data || []))
      .catch((err) => console.error(t('app.failedToLoadPageListings'), err));
  }, [t]);

  useEffect(() => {
    void fetchPages();
  }, [fetchPages]);

  const openTab = (pageCode: string, title: string, mode: 'config' | 'runtime' | 'manager') => {
    const tabId = `${pageCode}-${mode}`;
    setTabs((prev) => {
      if (prev.some((tab) => tab.id === tabId)) return prev;
      const nextTitle =
        mode === 'manager' ? t('app.factoryTab') : mode === 'config' ? t('app.configTab', { title }) : t('app.runtimeTab', { title });
      return [...prev, { id: tabId, title: nextTitle, pageCode, mode }];
    });
    setActiveTabId(tabId);
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null);
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

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="flex min-h-screen bg-[#020617] text-slate-100">
      <aside className="relative hidden w-[320px] shrink-0 border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_30%),linear-gradient(180deg,#020617,#0f172a)] xl:flex xl:flex-col">
        <div className="border-b border-white/10 px-7 py-7">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-semibold text-cyan-100">
              ES
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-[-0.04em] text-white">
                easy_saas
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                {t('app.sqlDrivenApplications')}
              </div>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-slate-400">
            {t('app.sidebarDescription')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200">{t('app.stageOneStory')}</div>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.stageOneStory1')}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.stageOneStory2')}</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.stageOneStory3')}</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{t('app.workspaceTabs')}</div>
              <button onClick={() => openTab('sys-page-manager', 'Factory', 'manager')} className={shellButton}>
                {t('app.openFactory')}
              </button>
            </div>
            {pages.map((page) => (
              <div key={page.pageCode} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">{page.title}</div>
                <div className="mt-1 text-xs text-slate-400">{page.routePath}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => openTab(page.pageCode, page.title, 'runtime')} className={shellButton}>
                    {t('app.runtime')}
                  </button>
                  <button onClick={() => openTab(page.pageCode, page.title, 'config')} className={shellButton}>
                    {t('app.config')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-5">
          <div className="flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs">
            <span className="font-semibold uppercase tracking-[0.22em] text-emerald-200">Engine state</span>
            <span className="rounded-full bg-emerald-300/20 px-2 py-1 font-semibold text-emerald-100">Connected</span>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#e2e8f0,#f8fafc_28%,#eef2ff)]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openTab('sys-page-manager', 'Factory', 'manager')}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 xl:hidden"
            >
              {t('app.openFactory')}
            </button>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  activeTabId === tab.id
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                }`}
              >
                <span>{tab.title}</span>
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    activeTabId === tab.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </header>

        <div className="flex-1">
          {activeTab ? (
            activeTab.mode === 'manager' ? (
              <PageManagerConsole
                pages={pages}
                onPageCreated={fetchPages}
                onPageDeleted={handlePageDeleted}
                openTab={openTab}
                t={t}
              />
            ) : (
              <PageLoader key={activeTab.id} pageCode={activeTab.pageCode} mode={activeTab.mode} />
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
                        className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-300"
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
                    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('app.whyItLands')}</div>
                      <div className="mt-4 space-y-3 text-sm text-slate-200">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.whyItLands1')}</div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.whyItLands2')}</div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">{t('app.whyItLands3')}</div>
                      </div>
                    </div>
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
                        <div className="mt-2 text-sm font-semibold text-amber-200">{t('app.themeValue')}</div>
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
