import React, { useEffect, useState } from 'react';

interface PageConfig {
  pageCode: string;
  title: string;
  queryCode?: string;
  config: {
    actions: Array<{ code: string; label: string; scriptCode: string; methodName: string }>;
    columns: Array<{ field: string; label: string }>;
    filters: Array<{ field: string; label: string }>;
  };
}

interface ColumnMeta {
  field: string;
  label: string;
  type: string;
}

interface QueryResult {
  columns: ColumnMeta[];
  rows: Array<Record<string, any>>;
}

export default function PageLoader({ pageCode }: { pageCode: string }) {
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/pages/${pageCode}`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        data.config?.actions?.forEach((action: any) => {
          if (action.scriptCode) {
            const id = `lc-script-${action.scriptCode}`;
            if (!document.getElementById(id)) {
              const script = document.createElement('script');
              script.id = id;
              script.src = `/api/v1/scripts/${action.scriptCode}.js`;
              script.async = true;
              document.body.appendChild(script);
            }
          }
        });

        if (data.queryCode) {
          setLoadingQuery(true);
          fetch(`/api/v1/queries/${data.queryCode}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ params: {} })
          })
            .then((res) => res.json())
            .then((qData) => {
              setQueryResult(qData);
              setLoadingQuery(false);
            })
            .catch((err) => {
              console.error("Failed to execute dynamic page query:", err);
              setLoadingQuery(false);
            });
        }
      });
  }, [pageCode]);

  if (!config) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading Configuration...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-5 border-b border-slate-100">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 bg-clip-text text-transparent">
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dynamically configured lowcode workspace.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
          {config.config?.actions?.map((act) => (
            <button
              key={act.code}
              className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition duration-150 ease-in-out cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
              onClick={() => {
                const globalActions = (window as any).AppActions?.[act.scriptCode];
                if (globalActions && typeof globalActions[act.methodName] === 'function') {
                  globalActions[act.methodName]({ id: 123 }, { refresh: () => console.log('refresh') });
                } else {
                  console.error(`JS Action method ${act.methodName} not found!`);
                }
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state for query execution */}
      {loadingQuery && (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="text-sm text-slate-500 font-medium animate-pulse">Loading dynamic query data...</p>
        </div>
      )}

      {/* Dynamic Table Rendering */}
      {!loadingQuery && queryResult && (
        <div className="relative overflow-x-auto shadow-xl shadow-slate-100/50 rounded-2xl border border-slate-100 bg-white/70 backdrop-blur-md">
          <table className="w-full text-sm text-left text-slate-500 border-collapse">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50/70 border-b border-slate-100">
              <tr>
                {queryResult.columns.map((col) => (
                  <th key={col.field} scope="col" className="px-6 py-4 font-semibold tracking-wider text-slate-600">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryResult.rows.length === 0 ? (
                <tr>
                  <td colSpan={queryResult.columns.length} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No records found.
                  </td>
                </tr>
              ) : (
                queryResult.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/50 transition-colors duration-150 ease-in-out group">
                    {queryResult.columns.map((col) => {
                      const val = row[col.field];
                      const formattedVal = val === null || val === undefined ? '-' : String(val);
                      return (
                        <td key={col.field} className="px-6 py-4 whitespace-nowrap text-slate-700 font-medium group-hover:text-slate-900 transition-colors">
                          {col.type === 'boolean' ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${val ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                              {val ? 'True' : 'False'}
                            </span>
                          ) : col.type === 'integer' || col.type === 'number' ? (
                            <span className="font-mono text-indigo-600">{formattedVal}</span>
                          ) : (
                            formattedVal
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

