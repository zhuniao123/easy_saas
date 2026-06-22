import { useEffect, useState } from 'react';
import PageLoader from './PageLoader';

function App() {
  const [pageCode, setPageCode] = useState<string | null>(null);

  useEffect(() => {
    // Parse URL parameter on load and on popstate
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      setPageCode(page);
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  const navigateToPage = (code: string | null) => {
    const url = new URL(window.location.href);
    if (code) {
      url.searchParams.set('page', code);
    } else {
      url.searchParams.delete('page');
    }
    window.history.pushState({}, '', url.toString());
    setPageCode(code);
  };

  if (pageCode) {
    return (
      <div className="min-h-screen bg-slate-50">
        <nav className="bg-white border-b border-slate-100 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <button 
              onClick={() => navigateToPage(null)}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 cursor-pointer flex items-center gap-1 border-0 bg-transparent"
            >
              ← Back to Portal
            </button>
            <span className="text-xs text-slate-400 font-medium font-mono">Dynamic Page: {pageCode}</span>
          </div>
        </nav>
        <PageLoader pageCode={pageCode} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-400 text-3xl shadow-inner animate-pulse">
          ⚡
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Lowcode Portal
        </h2>
        <p className="text-sm text-indigo-200/80 max-w-sm mx-auto">
          Dynamically generated, SQL-driven business page engine.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/10 backdrop-blur-md py-8 px-6 shadow-2xl border border-white/10 rounded-3xl space-y-6">
          <h3 className="text-lg font-semibold text-white">Available Workspaces</h3>
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => navigateToPage('test_page')}
              className="group relative flex items-center gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-left hover:bg-white/10 hover:border-indigo-500/50 transition duration-200 ease-in-out cursor-pointer hover:-translate-y-0.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 text-lg group-hover:scale-110 transition duration-200">
                📊
              </span>
              <div>
                <span className="block text-sm font-semibold text-white">Test Page Dashboard</span>
                <span className="block text-xs text-indigo-200/60 mt-0.5">Loads config from database & runs test_page SQL queries</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
