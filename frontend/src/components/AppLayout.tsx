import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NexoraLogo from './NexoraLogo';

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
    roles: ['ADMIN'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
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

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.username ?? 'User';

  const visible = links.filter(
    (l) => !l.roles || (user && l.roles.includes(user.role)),
  );

  return (
    <div className="nx-shell">
      <aside className="nx-sidebar">
        <NavLink to="/dashboard" className="nx-brand">
          <NexoraLogo size={34} />
          <span className="nx-brand-text">NEXORA</span>
        </NavLink>
        <div className="nx-nav-section">QUẢN LÝ</div>
        <nav className="nx-nav">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `nx-nav-link ${isActive ? 'active' : ''}`
              }
            >
              {l.icon}
              {l.label}
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
            <button type="button" className="nx-icon-btn" aria-label="Thông báo">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M6 16h12l-1.2-1.5a6.5 6.5 0 0 1-1.3-4V9a4.5 4.5 0 1 0-9 0v1.5a6.5 6.5 0 0 1-1.3 4L6 16Z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
              <span className="dot" />
            </button>
            <span className="nx-role-chip">
              {user?.role === 'ADMIN' ? 'Admin' : user?.role}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </span>
            <div className="nx-profile">
              <div className="nx-avatar">{initials(displayName)}</div>
              <div className="nx-profile-meta">
                <strong>{displayName}</strong>
                <span>{roleLabel(user?.role)}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="nx-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
