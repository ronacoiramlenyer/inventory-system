import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { onNotificationsRefresh } from '../api/notifications';

const ROLE_LABELS = {
  admin: 'Admin',
  staff: 'Staff',
  subject_coordinator: 'Subject Coordinator',
  secretary: 'Secretary',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [notifCounts, setNotifCounts] = useState({ other_requests: 0, filed_requests: 0 });

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api
      .get('/laboratories', { params: { status: 'pending' } })
      .then((res) => setPendingCount(res.data.length))
      .catch(() => {});
  }, [user]);

  // Counts of items awaiting this user's approval or status update --
  // re-fetched on every navigation, and also whenever a page fires
  // 'notifications:refresh' right after approving/filing/updating one in
  // place (no route change), so the badge doesn't lag. Staff always get
  // zeros (they aren't an approver or updater), so the backend keeps this
  // cheap for them.
  const loadNotifCounts = useCallback(() => {
    if (!user) return;
    api
      .get('/notifications/summary')
      .then((res) => setNotifCounts(res.data))
      .catch(() => {});
  }, [user]);

  useEffect(loadNotifCounts, [loadNotifCounts, location.pathname]);
  useEffect(() => onNotificationsRefresh(loadNotifCounts), [loadNotifCounts]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [{ to: '/', label: 'Dashboard', end: true }];
  if (user?.role !== 'secretary') {
    navItems.push({ to: '/laboratories', label: 'Laboratories', badge: user?.role === 'admin' ? pendingCount : 0 });
    navItems.push({ to: '/borrowing-requests', label: 'Borrowing Requests' });
  }
  navItems.push({ to: '/other-requests', label: 'Other Requests', badge: notifCounts.other_requests });
  // Subject Coordinators approve Pending EWRs, and Staff mark an In
  // Progress one Completed (same as they do for the other request types
  // above) -- without a nav entry here, neither had a way to even find one
  // to act on, since it isn't scoped to a single laboratory the way the
  // EMS list under each lab is.
  if (
    user?.role === 'secretary' ||
    user?.role === 'admin' ||
    user?.role === 'subject_coordinator' ||
    user?.role === 'staff'
  ) {
    navItems.push({ to: '/work-requests', label: 'Equipment Work Requests', badge: notifCounts.filed_requests });
  }
  if (user?.role === 'admin') {
    navItems.push(
      { to: '/admin', label: 'Admin Panel' },
      { to: '/departments', label: 'Departments' },
      { to: '/users', label: 'Staff Accounts' }
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="no-print w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <h1 className="font-bold text-lg leading-tight">Lab Management System</h1>
          <p className="text-xs text-slate-400">
            {user?.role === 'admin'
              ? 'All Departments'
              : user?.role === 'secretary'
                ? user?.department_names?.join(', ') || 'No departments assigned'
                : user?.department_name || 'Stock Management'}
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
          <p className="text-xs text-slate-400 mb-3">{ROLE_LABELS[user?.role] || 'Staff'}</p>
          <button
            onClick={handleLogout}
            className="w-full text-sm bg-slate-800 hover:bg-slate-700 rounded-lg py-1.5 transition"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">
        <div className="no-print flex justify-end mb-3">
          <a
            href="/help.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 hover:border-emerald-200 transition"
          >
            <span>Help / User Manual</span>
            <span className="text-xs text-slate-400">↗</span>
          </a>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
