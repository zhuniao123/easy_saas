import React, { useEffect, useState } from 'react';

interface PageConfig {
  pageCode: string;
  title: string;
  config: {
    actions: Array<{ code: string; label: string; scriptCode: string; methodName: string }>;
    columns: Array<{ field: string; label: string }>;
    filters: Array<{ field: string; label: string }>;
  };
}

export default function PageLoader({ pageCode }: { pageCode: string }) {
  const [config, setConfig] = useState<PageConfig | null>(null);

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
      });
  }, [pageCode]);

  if (!config) return <div>Loading Configuration...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{config.title}</h1>
      <div className="flex space-x-2">
        {config.config?.actions?.map((act) => (
          <button
            key={act.code}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
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
  );
}
