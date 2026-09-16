import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api
      .get('/laboratories', { params: { status: 'pending' } })
      .then((res) => setPendingCount(res.data.length))
      .catch(() => {});
  }, [user]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/laboratories', label: 'Laboratories', badge: user?.role === 'admin' ? pendingCount : 0 },
    { to: '/items', label: 'Items' },
    ...(user?.role === 'admin'
      ? [
          { to: '/departments', label: 'Departments' },
          { to: '/users', label: 'Staff Accounts' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="no-print w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <h1 className="font-bold text-lg leading-tight">Lab Inventory</h1>
          <p className="text-xs text-slate-400">
            {user?.role === 'admin' ? 'All Departments' : user?.department_name || 'Stock Management'}
          </p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span>{item.label}</span>
              {!!item.badge && (
                <span className="bg-amber-500 text-slate-900 text-xs font-bold rounded-full px-2 py-0.5">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-sm font-medium">{user?.full_name}</p>
          <p className="text-xs text-slate-400 capitalize mb-3">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="w-full text-sm bg-slate-800 hover:bg-slate-700 rounded-lg py-1.5 transition"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">
        <Outlet />
      </main>
    </div>
  );
}
