import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NexoraLogo from './NexoraLogo';
import NotificationBell from './NotificationBell';

const links: {
  to: string;
  label: string;
  roles?: string[];
  icon: ReactNode;
}[] = [
  {
    to: '/dashboard',
    label: 'Tổng quan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    ),
  },
  {
    to: '/users',
    label: 'Quản lý tài khoản',
    roles: ['ADMIN', 'MANAGER'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
      </svg>
    ),
  },
  {
    to: '/account',
    label: 'Tài khoản cá nhân',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 20v-1a5 5 0 0 1 10 0v1" />
        <path d="M17 11h4M19 9v4" />
      </svg>
    ),
  },
  {
    to: '/employees',
    label: 'Quản lý nhân sự',
    roles: ['ADMIN', 'MANAGER'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3" />
        <circle cx="16.5" cy="9" r="2.5" />
        <path d="M3.5 19c1.5-2.8 3.6-4.2 5.5-4.2s4 1.4 5.5 4.2" />
        <path d="M13.5 15.2c1.3-.7 2.8-1 4.3-.7 1.4.3 2.6 1.1 3.7 2.5" />
      </svg>
    ),
  },
  {
    to: '/departments',
    label: 'Quản lý phòng ban',
    roles: ['ADMIN', 'MANAGER'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-6h6v6" />
        <path d="M9 10h.01M15 10h.01" />
      </svg>
    ),
  },
  {
    to: '/tasks',
    label: 'Quản lý công việc',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    ),
  },
  {
    to: '/attendance',
    label: 'Lịch sử chấm công',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.5l3 1.5" />
      </svg>
    ),
  },
  {
    to: '/attendance?view=history',
    label: 'Lịch sử công',
    roles: ['EMPLOYEE'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h8M8 18h5" />
      </svg>
    ),
  },
  {
    to: '/leave',
    label: 'Quản lý nghỉ phép',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    ),
  },
  {
    to: '/logs',
    label: 'Nhật ký hệ thống',
    roles: ['ADMIN'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 9h6M9 13h6" />
      </svg>
    ),
  },
];

function roleLabel(role?: string) {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'MANAGER') return 'Quản lý';
  return 'Nhân viên';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const employeeNavOrder = [
  '/dashboard',
  '/attendance',
  '/tasks',
  '/leave',
  '/account',
  '/attendance?view=history',
];

function navLabel(link: (typeof links)[number], role?: string) {
  if (role !== 'EMPLOYEE') return link.label;
  if (link.to === '/attendance?view=history') return 'Lịch sử công';
  const map: Record<string, string> = {
    '/dashboard': 'Tổng quan',
    '/attendance': 'Chấm công',
    '/tasks': 'Công việc của tôi',
    '/leave': 'Đơn nghỉ phép',
    '/account': 'Hồ sơ cá nhân',
  };
  return map[link.to] ?? link.label;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName = user?.username ?? 'User';
  const isEmployee = user?.role === 'EMPLOYEE';

  const filtered = links.filter(
    (l) => !l.roles || (user && l.roles.includes(user.role)),
  );

  const visible = isEmployee
    ? employeeNavOrder
        .map((to) => filtered.find((l) => l.to === to))
        .filter((l): l is (typeof links)[number] => Boolean(l))
    : filtered;

  function linkActive(to: string) {
    const path = location.pathname;
    const search = location.search;
    if (to === '/attendance?view=history') {
      return path === '/attendance' && search.includes('view=history');
    }
    if (to === '/attendance') {
      return (
        (path === '/attendance' && !search.includes('view=history')) ||
        path.startsWith('/attendance/')
      );
    }
    if (to === '/dashboard') return path === '/dashboard' || path === '/';
    return path === to || path.startsWith(`${to}/`);
  }

  return (
    <div className="nx-shell">
      <aside className="nx-sidebar">
        <NavLink to="/dashboard" className="nx-brand">
          <NexoraLogo size={34} />
          <span className="nx-brand-text">NEXORA</span>
        </NavLink>
        <div className="nx-nav-section">
          {isEmployee ? 'NHÂN VIÊN' : 'QUẢN LÝ'}
        </div>
        <nav className="nx-nav">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/attendance'}
              className={() =>
                `nx-nav-link ${linkActive(l.to) ? 'active' : ''}`
              }
            >
              {l.icon}
              {navLabel(l, user?.role)}
            </NavLink>
          ))}
        </nav>
        <div className="nx-sidebar-foot">
          <button
            type="button"
            className="nx-logout-btn"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="nx-main-col">
        <header className="nx-topbar">
          <label className="nx-search">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Tìm kiếm nhân sự, công việc, tài khoản..."
              aria-label="Tìm kiếm"
            />
          </label>
          <div className="nx-top-actions">
            <NotificationBell />
            <span className="nx-role-chip">
              {user?.role === 'ADMIN' ? 'Admin' : user?.role}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </span>
            <NavLink to="/account" className="nx-profile" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="nx-avatar">{initials(displayName)}</div>
              <div className="nx-profile-meta">
                <strong>{displayName}</strong>
                <span>{roleLabel(user?.role)}</span>
              </div>
            </NavLink>
          </div>
        </header>
        <main className="nx-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
