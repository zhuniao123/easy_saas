import { useState } from 'react';
import { login } from './auth';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [loginName, setLoginName] = useState('owner');
  const [password, setPassword] = useState('owner123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(loginName.trim(), password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-[28px] border border-white/10 bg-slate-900/90 p-8 text-white shadow-2xl"
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">easy_saas · v1.2</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">登录</h1>
          <p className="mt-2 text-sm text-slate-400">
            Demo：老板 <code className="text-cyan-200">owner / owner123</code>，店员{' '}
            <code className="text-cyan-200">clerk / clerk123</code>
          </p>
        </div>
        {error && <div className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}
        <label className="block space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">用户名</span>
          <input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400"
            autoComplete="username"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400"
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-cyan-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
