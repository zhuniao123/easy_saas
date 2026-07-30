import type { ReactNode } from 'react';
import type { ComponentStatus } from '../componentTypes';

export function ComponentLoadingState({
  style = 'spinner',
  label = 'Loading',
  skeletonColumns,
}: {
  style?: 'spinner' | 'skeleton' | 'glow';
  label?: string;
  skeletonColumns?: Array<{ width?: number }>;
}) {
  if (style === 'skeleton') {
    const cols = skeletonColumns && skeletonColumns.length > 0 ? skeletonColumns : [{}, {}, {}];
    return (
      <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200/60 bg-white/50 p-6 space-y-4 dark:bg-slate-900/50">
        <div className="flex gap-4 border-b border-slate-100 pb-3 dark:border-slate-800">
          {cols.map((c, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700/60"
              style={{ width: c.width ? `${c.width}px` : '120px' }}
            />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((rowIdx) => (
          <div
            key={rowIdx}
            className="flex gap-4 border-b border-slate-50 py-2 last:border-0 dark:border-slate-800/40"
          >
            {cols.map((c, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800/30"
                style={{ width: c.width ? `${c.width}px` : '100px' }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (style === 'glow') {
    return (
      <div className="relative mt-6 overflow-hidden rounded-[26px] border border-cyan-500/20 bg-slate-950/80 py-20 text-center shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        <div className="absolute -left-10 -top-10 h-40 w-40 animate-pulse rounded-full bg-cyan-500/10 blur-[50px]" />
        <div className="absolute -bottom-10 -right-10 h-40 w-40 animate-pulse rounded-full bg-fuchsia-500/10 blur-[50px]" />
        <div className="relative space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div className="animate-pulse text-sm font-bold uppercase tracking-[0.28em] text-cyan-400">
            Streaming Data Engine
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Executing server raw SQL transaction log sequence...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-[26px] border border-slate-200/60 bg-white/50 py-16 dark:bg-slate-900/50">
      <div className="relative h-12 w-12">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-20" />
        <span className="relative flex h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
      </div>
      <p className="mt-4 animate-pulse text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </div>
  );
}

export function ComponentErrorState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function ComponentEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

/**
 * Thin status shell — components may render their own Ready UI and only use
 * this for loading/error, or wrap entirely.
 */
export function ComponentStatusShell({
  status,
  error,
  emptyMessage,
  loading,
  ready,
}: {
  status: ComponentStatus;
  error?: string | null;
  emptyMessage?: string;
  loading?: ReactNode;
  ready?: ReactNode;
}) {
  if (status === 'loading') {
    return <>{loading ?? <ComponentLoadingState />}</>;
  }
  if (status === 'error') {
    return <ComponentErrorState message={error || 'Component error'} />;
  }
  if (status === 'empty' && emptyMessage) {
    // Empty may still render ready UI with empty table — optional banner only when asked.
    return (
      <>
        {ready}
      </>
    );
  }
  return <>{ready}</>;
}
