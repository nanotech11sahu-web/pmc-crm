import { useEffect, useState, useCallback } from 'react';
import * as api from '../api/index.js';
import TableLoadingOverlay from '../components/TableLoadingOverlay.jsx';
import ResetPasswordModal from '../components/ResetPasswordModal.jsx';

function NewUserForm({ roles, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', role_id: roles[0]?.id || '' });
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { name, email, temp_password }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.createUser({ ...form, role_id: Number(form.role_id) });
      setJustCreated({ name: form.name, email: form.email, temp_password: res.temp_password });
      setForm({ name: '', email: '', mobile: '', role_id: roles[0]?.id || '' });
      onCreated();
    } finally { setBusy(false); }
  }

  if (justCreated) {
    return (
      <div className="card p-5 space-y-3">
        <div className="font-semibold">User created</div>
        <p className="text-sm text-slate-500">
          Share this temporary password with <span className="font-medium text-slate-700">{justCreated.name}</span> now —
          it's only shown once and can't be retrieved again after you leave this page.
        </p>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
          <div className="text-xs text-slate-400">Email</div>
          <div className="text-sm font-medium break-all">{justCreated.email}</div>
          <div className="text-xs text-slate-400 mt-2">Temporary password</div>
          <div className="text-sm font-mono font-semibold break-all">{justCreated.temp_password}</div>
        </div>
        <button className="btn btn-secondary w-full" onClick={() => setJustCreated(null)}>Add another user</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <div className="font-semibold">Add user</div>
      <input className="input" placeholder="Full name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <input className="input" placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      <input className="input" placeholder="Mobile" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
      <select className="input" value={form.role_id} onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Adding...' : 'Add user'}</button>
    </form>
  );
}

function PermissionMatrix({ roles, permissions }) {
  const [roleId, setRoleId] = useState(roles[0]?.id);
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!roleId) return;
    api.getRolePermissions(roleId).then((codes) => setChecked(new Set(codes)));
  }, [roleId]);

  function toggle(code) {
    setChecked((s) => {
      const next = new Set(s);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try { await api.setRolePermissions(roleId, [...checked]); } finally { setSaving(false); }
  }

  const byModule = permissions.reduce((acc, p) => { (acc[p.module] ||= []).push(p); return acc; }, {});
  const isSystemOwner = roles.find((r) => r.id === roleId)?.is_system;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="font-semibold">Role permissions</div>
        <select className="input sm:max-w-[180px]" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {isSystemOwner && <div className="text-xs text-amber-600 mb-3">Owner is a system role — it always has full access.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {Object.entries(byModule).map(([mod, perms]) => (
          <div key={mod}>
            <div className="text-xs font-semibold text-slate-400 uppercase mb-2">{mod}</div>
            <div className="space-y-1.5">
              {perms.map((p) => (
                <label key={p.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={isSystemOwner} checked={checked.has(p.code)} onChange={() => toggle(p.code)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary mt-5" disabled={saving || isSystemOwner} onClick={save}>{saving ? 'Saving...' : 'Save permissions'}</button>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [resetUser, setResetUser] = useState(null);

  const loadUsers = useCallback(() => {
    setUsersLoading(true);
    api.listUsers().then(setUsers).finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    loadUsers();
    api.listRoles().then(setRoles);
    api.listPermissions().then(setPermissions);
  }, [loadUsers]);

  async function toggleActive(u) {
    await api.updateUser(u.id, { is_active: u.is_active ? 0 : 1 });
    loadUsers();
  }

  async function changeRole(u, roleId) {
    await api.updateUser(u.id, { role_id: Number(roleId) });
    loadUsers();
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Users & Permissions</h1>
      <p className="text-slate-500 text-sm mb-6">Full access control — decide exactly what each teammate can and can't do.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-2 card overflow-hidden relative">
          <TableLoadingOverlay active={usersLoading} />

          {/* Mobile: stacked cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {users.map((u) => (
              <div key={u.id} className="p-4">
                <div className="font-medium">{u.name}</div>
                <div className="text-sm text-slate-500 break-all mb-2">{u.email}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select className="input flex-1 min-w-[120px]" value={u.role_id} onChange={(e) => changeRole(u, e.target.value)}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button onClick={() => toggleActive(u)} className={`badge shrink-0 ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>
                <button className="btn btn-secondary btn-sm mt-2" onClick={() => setResetUser(u)}>Reset password</button>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <select className="input" value={u.role_id} onChange={(e) => changeRole(u, e.target.value)}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)} className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => setResetUser(u)}>Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NewUserForm roles={roles} onCreated={loadUsers} />
      </div>

      {roles.length > 0 && permissions.length > 0 && <PermissionMatrix roles={roles} permissions={permissions} />}

      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
}
