import { useCallback, useEffect, useMemo, useState } from 'react';

interface RbacUser {
  userId: number;
  loginName: string;
  displayName: string;
  orgId?: number;
  enabled: boolean;
  roles: string[];
}

interface RbacRole {
  roleCode: string;
  name: string;
  dataScope?: string;
}

interface RbacPerm {
  permCode: string;
  permType: string;
  resourceCode: string;
  description?: string;
}

type Panel = 'pages' | 'users' | 'more';

const PERM_TYPE_LABELS: Record<string, string> = {
  page: '页面',
  action: '动作',
  query: '查询',
  field: '字段',
};

export default function RbacAdminConsole() {
  const [panel, setPanel] = useState<Panel>('pages');
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('clerk');
  const [permissions, setPermissions] = useState<RbacPerm[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [moreType, setMoreType] = useState<'action' | 'query' | 'field'>('action');

  // new user form
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newRoles, setNewRoles] = useState<string[]>(['clerk']);

  const loadRoles = useCallback(async () => {
    const res = await fetch('/api/v1/admin/rbac/roles');
    if (!res.ok) throw new Error('Failed to load roles');
    const data = (await res.json()) as RbacRole[];
    setRoles(data);
    if (data.length && !data.some((r) => r.roleCode === selectedRole)) {
      setSelectedRole(data[0].roleCode);
    }
  }, [selectedRole]);

  const loadPermissions = useCallback(async () => {
    const res = await fetch('/api/v1/admin/rbac/permissions');
    if (!res.ok) throw new Error('Failed to load permissions');
    setPermissions((await res.json()) as RbacPerm[]);
  }, []);

  const loadRolePerms = useCallback(async (role: string) => {
    const res = await fetch(`/api/v1/admin/rbac/roles/${encodeURIComponent(role)}/permissions`);
    if (!res.ok) throw new Error('Failed to load role permissions');
    const data = await res.json();
    setGranted(new Set((data.permCodes || []) as string[]));
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/v1/admin/rbac/users');
    if (!res.ok) throw new Error('Failed to load users');
    setUsers((await res.json()) as RbacUser[]);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadRoles(), loadPermissions(), loadUsers()]);
      await loadRolePerms(selectedRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [loadRoles, loadPermissions, loadUsers, loadRolePerms, selectedRole]);

  useEffect(() => {
    void reloadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadRolePerms(selectedRole).catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [selectedRole, loadRolePerms]);

  const pagePerms = useMemo(
    () => permissions.filter((p) => p.permType === 'page'),
    [permissions]
  );
  const morePerms = useMemo(
    () => permissions.filter((p) => p.permType === moreType),
    [permissions, moreType]
  );

  const filteredPages = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return pagePerms;
    return pagePerms.filter(
      (p) =>
        p.permCode.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.resourceCode.toLowerCase().includes(q)
    );
  }, [pagePerms, filter]);

  const filteredMore = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return morePerms;
    return morePerms.filter(
      (p) =>
        p.permCode.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.resourceCode.toLowerCase().includes(q)
    );
  }, [morePerms, filter]);

  const togglePerm = (code: string) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const setAllOfType = (type: string, on: boolean) => {
    const codes = permissions.filter((p) => p.permType === type).map((p) => p.permCode);
    setGranted((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });
  };

  const saveRolePermissions = async (type?: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const body: Record<string, unknown> = {
        permCodes: Array.from(granted).filter((code) => {
          if (!type) return true;
          const meta = permissions.find((p) => p.permCode === code);
          return meta?.permType === type;
        }),
      };
      if (type) body.permType = type;

      // When saving one type, still send only that type's selection;
      // backend replaces only that type's grants.
      const res = await fetch(`/api/v1/admin/rbac/roles/${encodeURIComponent(selectedRole)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Save failed');
      setGranted(new Set((data.permCodes || []) as string[]));
      setStatus(`已保存角色 ${selectedRole} 的${type ? PERM_TYPE_LABELS[type] || type : '全部'}权限`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const refreshCatalog = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/v1/admin/rbac/refresh-catalog', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Refresh failed');
      await loadPermissions();
      await loadRolePerms(selectedRole);
      setStatus(`权限目录已同步（${data.permissionCount ?? '?'} 项），owner 已自动拥有全部；其他角色矩阵保持不变`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/v1/admin/rbac/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginName: newLogin.trim(),
          password: newPassword,
          displayName: newDisplay.trim() || newLogin.trim(),
          roles: newRoles,
          enabled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Create failed');
      setNewLogin('');
      setNewPassword('');
      setNewDisplay('');
      setNewRoles(['clerk']);
      await loadUsers();
      setStatus(`用户 ${data.loginName} 已创建`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  const patchUser = async (user: RbacUser, patch: Partial<RbacUser> & { password?: string }) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/admin/rbac/users/${user.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Update failed');
      await loadUsers();
      setStatus(`用户 ${user.loginName} 已更新`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const isSysPage = (code: string) => code.startsWith('page:sys-') || code === 'perm:config';

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.25),_transparent_28%),linear-gradient(160deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_30px_90px_rgba(2,6,23,0.42)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-violet-200">
              System · RBAC
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.04em]">权限与用户管理</h2>
            <p className="text-sm leading-7 text-slate-300">
              仅 <code className="text-violet-200">perm:config</code> / owner 可见。配置角色的页面权限、用户与角色绑定。
              数据范围隔离暂不启用。同步目录会发现新页面权限并赋给 owner，不会覆盖 clerk 已改矩阵。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshCatalog()}
              disabled={loading}
              className="rounded-full border border-violet-300/30 bg-violet-400/15 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-violet-100 hover:bg-violet-400/25 disabled:opacity-50"
            >
              同步权限目录
            </button>
            <button
              type="button"
              onClick={() => void reloadAll()}
              disabled={loading}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-white hover:bg-white/10 disabled:opacity-50"
            >
              刷新
            </button>
          </div>
        </div>
      </section>

      {(error || status) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pages', '页面权限'],
            ['users', '用户'],
            ['more', '动作 / 查询 / 字段'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.14em] transition ${
              panel === id
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(panel === 'pages' || panel === 'more') && (
        <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
          <aside className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">角色</div>
            <div className="mt-3 space-y-1.5">
              {roles.map((r) => (
                <button
                  key={r.roleCode}
                  type="button"
                  onClick={() => setSelectedRole(r.roleCode)}
                  className={`flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition ${
                    selectedRole === r.roleCode
                      ? 'border-violet-400 bg-violet-50 text-violet-900'
                      : 'border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-sm font-semibold">{r.name}</span>
                  <span className="text-[11px] text-slate-500">{r.roleCode}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-400">
              编辑后点「保存」。owner 会强制保留管理入口权限，避免锁死自己。
            </p>
          </aside>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {panel === 'pages' ? '页面权限' : PERM_TYPE_LABELS[moreType] || moreType}
                  {' · '}
                  {selectedRole}
                </div>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  {panel === 'pages' ? '勾选该角色可打开的页面' : '勾选细粒度权限'}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {panel === 'more' &&
                  (['action', 'query', 'field'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMoreType(t)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        moreType === t
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {PERM_TYPE_LABELS[t]}
                    </button>
                  ))}
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="筛选…"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => setAllOfType(panel === 'pages' ? 'page' : moreType, true)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setAllOfType(panel === 'pages' ? 'page' : moreType, false)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  全不选
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void saveRolePermissions(panel === 'pages' ? 'page' : moreType)}
                  className="rounded-full bg-slate-950 px-4 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(panel === 'pages' ? filteredPages : filteredMore).map((p) => {
                const checked = granted.has(p.permCode);
                const sys = isSysPage(p.permCode);
                return (
                  <label
                    key={p.permCode}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition ${
                      checked
                        ? 'border-violet-300 bg-violet-50/80'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => togglePerm(p.permCode)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {p.resourceCode}
                        {sys && (
                          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            系统
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{p.permCode}</span>
                      {p.description && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">{p.description}</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {(panel === 'pages' ? filteredPages : filteredMore).length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
                  无匹配权限。可先「同步权限目录」。
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {panel === 'users' && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={createUser}
            className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm space-y-4"
          >
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">新建用户</div>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">账号与角色</h3>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">登录名</span>
              <input
                required
                value={newLogin}
                onChange={(e) => setNewLogin(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">密码</span>
              <input
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">显示名</span>
              <input
                value={newDisplay}
                onChange={(e) => setNewDisplay(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">角色</span>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const on = newRoles.includes(r.roleCode);
                  return (
                    <button
                      key={r.roleCode}
                      type="button"
                      onClick={() =>
                        setNewRoles((prev) =>
                          on ? prev.filter((x) => x !== r.roleCode) : [...prev, r.roleCode]
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        on ? 'border-violet-400 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-slate-950 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-slate-800 disabled:opacity-50"
            >
              创建用户
            </button>
          </form>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">用户列表</div>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{users.length} 个账号</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-950">{u.displayName}</span>
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {u.loginName}
                      </span>
                      {!u.enabled && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          已停用
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      角色：{(u.roles || []).join(', ') || '—'} · org {u.orgId ?? 1}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((r) => {
                      const on = (u.roles || []).includes(r.roleCode);
                      return (
                        <button
                          key={r.roleCode}
                          type="button"
                          onClick={() => {
                            const next = on
                              ? (u.roles || []).filter((x) => x !== r.roleCode)
                              : [...(u.roles || []), r.roleCode];
                            if (next.length === 0) {
                              setError('至少保留一个角色');
                              return;
                            }
                            void patchUser(u, { roles: next });
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            on ? 'border-violet-400 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {r.roleCode}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => void patchUser(u, { enabled: !u.enabled })}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {u.enabled ? '停用' : '启用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const pwd = window.prompt(`重置 ${u.loginName} 的密码`, '');
                        if (pwd) void patchUser(u, { password: pwd });
                      }}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      重置密码
                    </button>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
                  暂无用户
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
