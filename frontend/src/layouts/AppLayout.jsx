import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', perm: null },
  { to: '/listings', label: 'Listings', icon: '☰', perm: 'directory.view' },
  { to: '/users', label: 'Users & Roles', icon: '⚙', perm: 'user.manage' },
  { to: '/settings', label: 'Settings', icon: '⚙️', perm: null },
];

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = NAV.filter((n) => !n.perm || can(n.perm));

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">PMC CRM</div>
          <div className="text-xs text-slate-400">Yellow Pages Lead Ops</div>
        </div>
        <button className="md:hidden text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
          ✕
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <span className="w-4 text-center">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-200">
        <div className="text-sm font-medium truncate">{user?.name}</div>
        <div className="text-xs text-slate-400 mb-2">{user?.role}</div>
        <button onClick={logout} className="btn btn-secondary btn-sm w-full">Log out</button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-30">
        <button className="text-2xl leading-none px-1" onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
        <div className="font-bold">PMC CRM</div>
        <div className="w-7" />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-slate-200 bg-white flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] bg-white flex flex-col shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
