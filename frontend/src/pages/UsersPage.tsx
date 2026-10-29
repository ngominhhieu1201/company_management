import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import api from '../api/client';
import '../styles/users.css';


type EmpLink = {
  id: number;
  fullName: string;
  employeeCode: string;
  email: string;
  status: string;
  departmentId: number | null;
  departmentName: string | null;
};

type UserRow = {
  id: number;
  uid: string;
  username: string;
  role: string;
  status: string;
  employeeId: number | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  online: boolean;
  workEmail: string | null;
  employee: EmpLink | null;
};

type Stats = {
  total: number;
  active: number;
  locked: number;
  privileged: number;
  adminCount: number;
  managerCount: number;
  coveragePct: number;
  availabilityPct: number;
  lockedInactiveEmp: number;
  lockedOther: number;
};

type Dept = { id: number; name: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleClass(role: string) {
  if (role === 'ADMIN') return 'admin';
  if (role === 'MANAGER') return 'manager';
  return 'employee';
}

function formatLogin(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function exportCsv(rows: UserRow[]) {
  const header = [
    'UID',
    'Username',
    'Role',
    'Status',
    'Employee',
    'EmployeeCode',
    'Department',
    'Email',
    'LastLoginAt',
    'LastLoginIp',
  ];
  const lines = rows.map((r) =>
    [
      r.uid,
      r.username,
      r.role,
      r.status,
      r.employee?.fullName ?? '',
      r.employee?.employeeCode ?? '',
      r.employee?.departmentName ?? '',
      r.workEmail ?? '',
      r.lastLoginAt ?? '',
      r.lastLoginIp ?? '',
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexora-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [depts, setDepts] = useState<Dept[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const { data } = await api.get('/users/stats');
    setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users', {
        params: {
          q: q || undefined,
          role: role || undefined,
          status: status || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          page,
          pageSize,
        },
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setError('');
    } catch {
      setError('Không tải được danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  }, [q, role, status, departmentId, page, pageSize]);

  useEffect(() => {
    void loadStats().catch(() => setError('Không tải được thống kê tài khoản'));
    api
      .get('/departments')
      .then((r) => setDepts(r.data))
      .catch(() => undefined);
  }, [loadStats]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      setQ(qDraft.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [qDraft]);

  const pageNums = useMemo(() => {
    const max = totalPages;
    const cur = page;
    const set = new Set<number>([1, max, cur - 1, cur, cur + 1]);
    return [...set].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
  }, [page, totalPages]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  async function toggleLock(u: UserRow) {
    try {
      await api.patch(`/users/${u.id}`, {
        status: u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE',
      });
      await Promise.all([loadList(), loadStats()]);
    } catch {
      setError('Cập nhật trạng thái thất bại');
    }
  }

  async function exportAll() {
    try {
      const { data } = await api.get('/users', {
        params: {
          q: q || undefined,
          role: role || undefined,
          status: status || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          page: 1,
          pageSize: 100,
        },
      });
      exportCsv(data.items as UserRow[]);
    } catch {
      setError('Xuất danh sách thất bại');
    }
  }

  function clearFilters() {
    setQDraft('');
    setQ('');
    setRole('');
    setStatus('');
    setDepartmentId('');
    setPage(1);
  }

  return (
    <div>
      <div className="nx-users-head">
        <div>
          <h1>Quản Lý Tài Khoản Người Dùng</h1>
          <p>Quản trị RBAC, khóa/mở khóa và liên kết nhân sự từ dữ liệu hệ thống.</p>
        </div>
        <div className="nx-users-actions">
          <button type="button" className="nx-btn-outline" onClick={() => void exportAll()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            Xuất danh sách
          </button>
          <Link to="/users/new" className="nx-btn-primary">
            + Thêm tài khoản mới
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {stats && (
        <div className="nx-users-kpis">
          <div className="nx-ukpi">
            <div className="nx-ukpi-top">
              <div>
                <div className="nx-ukpi-label">Tổng tài khoản</div>
                <div className="nx-ukpi-value">{stats.total}</div>
                <div className="nx-ukpi-hint">
                  {stats.coveragePct}% đã liên kết nhân sự
                </div>
              </div>
              <div className="nx-ukpi-icon teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="nx-ukpi">
            <div className="nx-ukpi-top">
              <div>
                <div className="nx-ukpi-label">Tài khoản hoạt động</div>
                <div className="nx-ukpi-value">{stats.active}</div>
                <div className="nx-ukpi-hint">
                  {stats.availabilityPct}% khả dụng hệ thống
                </div>
              </div>
              <div className="nx-ukpi-icon green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="nx-ukpi-bar">
              <span style={{ width: `${Math.min(100, stats.availabilityPct)}%` }} />
            </div>
          </div>
          <div className="nx-ukpi">
            <div className="nx-ukpi-top">
              <div>
                <div className="nx-ukpi-label">Tài khoản bị khóa</div>
                <div className="nx-ukpi-value danger">
                  {String(stats.locked).padStart(2, '0')}
                </div>
                <div className="nx-ukpi-hint">
                  {stats.lockedInactiveEmp} NV không hoạt động, {stats.lockedOther} còn lại
                </div>
              </div>
              <div className="nx-ukpi-icon red">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              </div>
            </div>
          </div>
          <div className="nx-ukpi">
            <div className="nx-ukpi-top">
              <div>
                <div className="nx-ukpi-label">Đặc quyền</div>
                <div className="nx-ukpi-value">{stats.privileged}</div>
                <div className="nx-ukpi-hint">
                  {stats.adminCount} Admin · {stats.managerCount} Manager
                </div>
              </div>
              <div className="nx-ukpi-icon gold">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="nx-filters">
        <label className="nx-f-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Username, UID, email, nhân sự..."
          />
        </label>
        <select
          value={role}
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value);
          }}
        >
          <option value="">Tất cả vai trò</option>
          <option value="ADMIN">ADMIN</option>
          <option value="MANAGER">MANAGER</option>
          <option value="EMPLOYEE">EMPLOYEE</option>
        </select>
        <select
          value={departmentId}
          onChange={(e) => {
            setPage(1);
            setDepartmentId(e.target.value);
          }}
        >
          <option value="">Tất cả phòng ban</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="LOCKED">Đã khóa</option>
        </select>
        <button type="button" className="nx-clear" onClick={clearFilters}>
          Xóa bộ lọc
        </button>
      </div>

      <div className="nx-utable-wrap">
        {loading ? (
          <div className="text-center py-5">
            <Spinner />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="nx-utable">
              <thead>
                <tr>
                  <th>Tài khoản / Username</th>
                  <th>Nhân viên liên kết</th>
                  <th>Email công việc</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Đăng nhập gần nhất</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="nx-empty">
                      Không có tài khoản phù hợp bộ lọc.
                    </td>
                  </tr>
                )}
                {items.map((u) => (
                  <tr
                    key={u.id}
                    className={u.status === 'LOCKED' ? 'is-locked' : undefined}
                  >
                    <td>
                      <div className="nx-u-acc">
                        <div className="av">{initials(u.username)}</div>
                        <div>
                          <strong>
                            <Link
                              to={`/users/${u.id}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {u.username}
                            </Link>
                          </strong>
                          <div className="uid">UID: {u.uid}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.employee ? (
                        <div className="nx-u-emp">
                          <strong>{u.employee.fullName}</strong>
                          <span>
                            {u.employee.employeeCode}
                            {u.employee.departmentName
                              ? ` · ${u.employee.departmentName}`
                              : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">Chưa liên kết</span>
                      )}
                    </td>
                    <td>{u.workEmail || '—'}</td>
                    <td>
                      <span className={`nx-role-pill ${roleClass(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      {u.status === 'ACTIVE' ? (
                        <span className="nx-status-pill active">
                          <span className="dot" /> Hoạt động
                        </span>
                      ) : (
                        <span className="nx-status-pill locked">Đã khóa</span>
                      )}
                    </td>
                    <td>
                      <div className="nx-login-cell">
                        {u.online ? (
                          <div className="online">Đang trực tuyến</div>
                        ) : formatLogin(u.lastLoginAt) ? (
                          <div>{formatLogin(u.lastLoginAt)}</div>
                        ) : (
                          <div className="never">Chưa đăng nhập</div>
                        )}
                        {u.lastLoginIp && (
                          <div className="ip">{u.lastLoginIp}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="nx-row-actions">
                        <Link
                          to={`/users/${u.id}`}
                          className="nx-icon-act"
                          title="Chi tiết"
                          style={{ textDecoration: 'none' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 20h4L18 10l-4-4L4 16v4Z" />
                          </svg>
                        </Link>
                        <Link
                          to={`/users/${u.id}`}
                          className="nx-icon-act"
                          title="Audit"
                          style={{ textDecoration: 'none' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" />
                          </svg>
                        </Link>
                        <button
                          type="button"
                          className={`nx-icon-act ${u.status === 'LOCKED' ? 'unlock' : ''}`}
                          title={u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
                          onClick={() => void toggleLock(u)}
                        >
                          {u.status === 'ACTIVE' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="5" y="11" width="14" height="10" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="5" y="11" width="14" height="10" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 7.5-1.9" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="nx-pager">
          <div className="nx-pager-info">
            Hiển thị {rangeStart} – {rangeEnd} trong số {total} tài khoản
          </div>
          <div className="nx-pager-btns">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {pageNums.map((n, i) => {
              const prev = pageNums[i - 1];
              const gap = prev != null && n - prev > 1;
              return (
                <span key={n} style={{ display: 'contents' }}>
                  {gap && <span style={{ padding: '0 0.2rem' }}>…</span>}
                  <button
                    type="button"
                    className={n === page ? 'active' : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
