import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/employees.css';

type AccountInfo =
  | {
      linked: true;
      id: number;
      username: string;
      role: string;
      status: string;
      locked: boolean;
    }
  | { linked: false };

type PresenceInfo = {
  kind: 'WORKING' | 'LATE' | 'LEAVE' | 'SUSPENDED' | 'ABSENT';
  label: string;
  checkInTime: string | null;
  leaveType: string | null;
};

type EmpRow = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode?: string | null;
  position: string;
  hireDate: string | null;
  status: string;
  account: AccountInfo;
  todayPresence?: PresenceInfo;
};

type Stats = {
  total: number;
  active: number;
  inactive: number;
  newLast30Days: number;
  workingToday?: number;
  workingPct?: number;
  onLeaveToday?: number;
  accountsActive?: number;
  accountsLocked?: number;
  headcountTarget?: number | null;
  departmentName?: string | null;
  departmentCode?: string | null;
};

type Dept = { id: number; name: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const raw = iso.slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function exportCsv(rows: EmpRow[]) {
  const header = [
    'EmployeeCode',
    'FullName',
    'Position',
    'Department',
    'Email',
    'Phone',
    'HireDate',
    'Status',
    'Presence',
    'Account',
    'Role',
  ];
  const lines = rows.map((r) =>
    [
      r.employeeCode,
      r.fullName,
      r.position,
      r.departmentName ?? '',
      r.email,
      r.phone,
      r.hireDate ?? '',
      r.status,
      r.todayPresence?.label ?? '',
      r.account.linked
        ? r.account.locked
          ? 'LOCKED'
          : r.account.username
        : '',
      r.account.linked ? r.account.role : '',
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
  a.download = `nexora-employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function presenceClass(kind?: string) {
  if (kind === 'WORKING') return 'working';
  if (kind === 'LATE') return 'late';
  if (kind === 'LEAVE') return 'leave';
  if (kind === 'SUSPENDED') return 'suspended';
  return 'absent';
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canCreate = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [items, setItems] = useState<EmpRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(isManager ? 10 : 25);
  const [totalPages, setTotalPages] = useState(1);
  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState('');
  const [account, setAccount] = useState('');
  const [presence, setPresence] = useState('');
  const [sort, setSort] = useState('code_asc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    const { data } = await api.get('/employees/stats');
    setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees', {
        params: {
          q: q || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          status: status || undefined,
          position: position || undefined,
          account: account || undefined,
          presence: presence || undefined,
          sort,
          page,
          pageSize,
        },
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setSelected(new Set());
      setError('');
    } catch {
      setError('Không tải được danh sách nhân sự');
    } finally {
      setLoading(false);
    }
  }, [q, departmentId, status, position, account, presence, sort, page, pageSize]);

  useEffect(() => {
    void loadStats().catch(() => undefined);
    api
      .get('/departments')
      .then((r) => setDepts(r.data))
      .catch(() => undefined);
    api
      .get('/employees', { params: { page: 1, pageSize: 100 } })
      .then((r) => {
        const pos = [
          ...new Set(
            (r.data.items as EmpRow[])
              .map((e) => e.position)
              .filter((p): p is string => Boolean(p)),
          ),
        ].sort((a, b) => a.localeCompare(b, 'vi'));
        setPositions(pos);
      })
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
    const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    return [...set]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function clearFilters() {
    setQDraft('');
    setQ('');
    setDepartmentId('');
    setStatus('');
    setPosition('');
    setAccount('');
    setPresence('');
    setSort('code_asc');
    setPage(1);
  }

  async function exportAll() {
    try {
      const { data } = await api.get('/employees', {
        params: {
          q: q || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          status: status || undefined,
          position: position || undefined,
          account: account || undefined,
          presence: presence || undefined,
          sort,
          page: 1,
          pageSize: 100,
        },
      });
      exportCsv(data.items as EmpRow[]);
    } catch {
      setError('Xuất danh sách thất bại');
    }
  }

  async function restore(emp: EmpRow) {
    try {
      await api.patch(`/employees/${emp.id}`, { status: 'ACTIVE' });
      await Promise.all([loadList(), loadStats()]);
    } catch {
      setError('Khôi phục trạng thái thất bại');
    }
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((e) => e.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const scopeLabel = stats
    ? [
        stats.departmentName || 'Phạm vi quản lý',
        stats.departmentCode ? `(${stats.departmentCode})` : null,
        `• ${stats.total} nhân sự trực thuộc`,
        stats.headcountTarget != null
          ? `(${stats.total}/${stats.headcountTarget} định biên)`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  if (isManager) {
    return (
      <div className="nx-emp-mgr">
        <div className="nx-emp-crumb">
          <span>Quản trị quản lý</span>
          <span className="sep">›</span>
          <span>Phân hệ Nhân sự</span>
          <span className="sep">›</span>
          <span>Danh sách nhân viên trực thuộc</span>
        </div>

        <div className="nx-emp-head">
          <div>
            <h1>Danh Sách Nhân Viên Thuộc Phạm Vi Quản Lý</h1>
            {stats && <div className="nx-emp-scope">{scopeLabel}</div>}
          </div>
          <div className="nx-emp-actions">
            <button
              type="button"
              className="nx-btn-outline"
              onClick={() => void exportAll()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
              </svg>
              Xuất danh sách
            </button>
            {canCreate && (
              <Link to="/employees/new" className="nx-btn-primary">
                + Thêm nhân viên
              </Link>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {stats && (
          <div className="nx-emp-kpis">
            <div className="nx-emp-kpi">
              <div className="ico blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z" />
                </svg>
              </div>
              <div>
                <div className="label">TỔNG NHÂN SỰ / ĐỊNH BIÊN</div>
                <div className="value">
                  {stats.total}
                  {stats.headcountTarget != null && (
                    <span className="nx-emp-kpi-sub">
                      {' '}
                      / {stats.headcountTarget} vị trí
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="nx-emp-kpi">
              <div className="ico green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="label">ĐANG LÀM VIỆC / ACTIVE HÔM NAY</div>
                <div className="value">
                  {stats.workingToday ?? 0}
                  <span className="nx-emp-kpi-hint">
                    {' '}
                    ({stats.workingPct ?? 0}%)
                  </span>
                </div>
              </div>
            </div>
            <div className="nx-emp-kpi">
              <div className="ico orange">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path d="M8 3v4M16 3v4M4 10h16" />
                </svg>
              </div>
              <div>
                <div className="label">NGHỈ PHÉP / VẮNG MẶT</div>
                <div className="value">
                  {String(stats.onLeaveToday ?? 0).padStart(2, '0')}
                  <span className="nx-emp-kpi-sub"> nhân viên</span>
                </div>
              </div>
            </div>
            <div className="nx-emp-kpi">
              <div className="ico teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" />
                </svg>
              </div>
              <div>
                <div className="label">TRẠNG THÁI TÀI KHOẢN</div>
                <div className="value">
                  {stats.accountsActive ?? 0}
                  <span className="nx-emp-kpi-sub"> active</span>
                </div>
                {(stats.accountsLocked ?? 0) > 0 && (
                  <div className="nx-emp-locked-hint">
                    {stats.accountsLocked} LOCKED
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="nx-emp-filters">
          <label className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Tìm theo Họ tên, Mã nhân viên (NV-2025-xxx), Email..."
            />
          </label>
          <select
            value={departmentId}
            onChange={(e) => {
              setPage(1);
              setDepartmentId(e.target.value);
            }}
          >
            <option value="">Nhóm: Tất cả</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={position}
            onChange={(e) => {
              setPage(1);
              setPosition(e.target.value);
            }}
          >
            <option value="">Chức vụ: Tất cả</option>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={account}
            onChange={(e) => {
              setPage(1);
              setAccount(e.target.value);
            }}
          >
            <option value="">Tài khoản: Tất cả</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="LOCKED">LOCKED</option>
            <option value="NONE">Chưa cấp TK</option>
          </select>
          <button type="button" className="nx-btn-outline" onClick={clearFilters}>
            Xóa lọc
          </button>
        </div>

        <div className="nx-emp-quick">
          {(
            [
              ['', `Tất cả (${stats?.total ?? total})`],
              ['WORKING', `Đang làm việc (${stats?.workingToday ?? 0})`],
              [
                'ABSENT',
                `Vắng mặt / Nghỉ phép (${stats?.onLeaveToday ?? 0})`,
              ],
              [
                'LOCKED',
                `Tài khoản LOCKED (${stats?.accountsLocked ?? 0})`,
              ],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key || 'all'}
              type="button"
              className={presence === key ? 'on' : undefined}
              onClick={() => {
                setPage(1);
                setPresence(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="nx-emp-wrap">
          {loading ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="nx-emp-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={
                          items.length > 0 && selected.size === items.length
                        }
                        onChange={toggleAll}
                        aria-label="Chọn tất cả"
                      />
                    </th>
                    <th>Mã NV</th>
                    <th>Họ và tên</th>
                    <th>Phòng ban &amp; nhóm</th>
                    <th>Chức danh chuyên môn</th>
                    <th>Hiện diện hôm nay</th>
                    <th>Tài khoản</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-muted">
                        Không có nhân sự phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                  {items.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(e.id)}
                          onChange={() => toggleOne(e.id)}
                          aria-label={`Chọn ${e.fullName}`}
                        />
                      </td>
                      <td className="nx-emp-code">{e.employeeCode}</td>
                      <td>
                        <div className="nx-emp-person">
                          <div className="av">{initials(e.fullName)}</div>
                          <div>
                            <strong>{e.fullName}</strong>
                            <span>{e.email || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="nx-emp-dept-cell">
                          <strong>{e.departmentName || '—'}</strong>
                          {e.departmentCode && (
                            <span>{e.departmentCode}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {e.position ? (
                          <span className="nx-emp-title">{e.position}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span
                          className={`nx-emp-presence ${presenceClass(e.todayPresence?.kind)}`}
                        >
                          {e.todayPresence?.label || '—'}
                        </span>
                      </td>
                      <td>
                        {!e.account.linked && (
                          <span className="nx-emp-acc-badge none">CHƯA CẤP</span>
                        )}
                        {e.account.linked && e.account.locked && (
                          <span className="nx-emp-acc-badge locked">LOCKED</span>
                        )}
                        {e.account.linked && !e.account.locked && (
                          <span className="nx-emp-acc-badge active">ACTIVE</span>
                        )}
                      </td>
                      <td>
                        <div className="nx-emp-acts">
                          <Link
                            to={`/employees/${e.id}`}
                            className="nx-emp-profile"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            Hồ sơ
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="nx-emp-pager">
            <div className="nx-emp-pager-info">
              Hiển thị {rangeStart} – {rangeEnd} trong tổng số {total} nhân sự
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
              >
                <option value={10}>10 / trang</option>
                <option value={25}>25 / trang</option>
                <option value={50}>50 / trang</option>
              </select>
            </div>
            <div className="nx-emp-pager-btns">
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
                    {gap && <span>…</span>}
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

  /* —— Admin view (giữ nguyên nghiệp vụ) —— */
  return (
    <div>
      <div className="nx-emp-crumb">
        <span>Quản trị hệ thống</span>
        <span className="sep">›</span>
        <span>Quản lý nhân sự</span>
      </div>

      <div className="nx-emp-head">
        <h1>Quản Lý Hồ Sơ Nhân Sự</h1>
        <div className="nx-emp-actions">
          <button
            type="button"
            className="nx-btn-outline"
            onClick={() => void exportAll()}
          >
            Xuất Excel
          </button>
          {user?.role === 'ADMIN' && (
            <Link to="/employees/new" className="nx-btn-primary">
              + Thêm nhân viên mới
            </Link>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {stats && (
        <div className="nx-emp-kpis">
          <div className="nx-emp-kpi">
            <div className="ico blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z" />
              </svg>
            </div>
            <div>
              <div className="label">Tổng nhân sự</div>
              <div className="value">{stats.total}</div>
            </div>
          </div>
          <div className="nx-emp-kpi">
            <div className="ico green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="label">Đang làm việc</div>
              <div className="value">{stats.active}</div>
            </div>
          </div>
          <div className="nx-emp-kpi">
            <div className="ico red">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </div>
            <div>
              <div className="label">Đã nghỉ / ngưng</div>
              <div className="value">{stats.inactive}</div>
            </div>
          </div>
          <div className="nx-emp-kpi">
            <div className="ico teal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div>
              <div className="label">Mới 30 ngày</div>
              <div className="value">{stats.newLast30Days}</div>
            </div>
          </div>
        </div>
      )}

      <div className="nx-emp-filters">
        <label className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Tìm mã, tên, email, SĐT…"
          />
        </label>
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
          <option value="ACTIVE">Đang làm việc</option>
          <option value="SUSPENDED">Tạm ngưng</option>
          <option value="INACTIVE">Đã nghỉ việc</option>
        </select>
        <select
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
        >
          <option value="code_asc">Mã NV ↑</option>
          <option value="name_asc">Họ tên A–Z</option>
          <option value="name_desc">Họ tên Z–A</option>
          <option value="hire_desc">Ngày vào ↓</option>
          <option value="hire_asc">Ngày vào ↑</option>
        </select>
        <button type="button" className="nx-btn-outline" onClick={clearFilters}>
          Đặt lại
        </button>
      </div>

      <div className="nx-emp-meta">
        Đang áp dụng: {departmentId ? 'Theo phòng ban' : 'Toàn công ty'} ({total}
        ) · Sắp xếp theo bộ lọc hiện tại
      </div>

      <div className="nx-emp-wrap">
        {loading ? (
          <div className="text-center py-5">
            <Spinner />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="nx-emp-table">
              <thead>
                <tr>
                  <th>Mã NV</th>
                  <th>Họ tên &amp; chức danh</th>
                  <th>Phòng ban</th>
                  <th>Liên hệ</th>
                  <th>Ngày gia nhập</th>
                  <th>Trạng thái</th>
                  <th>Tài khoản HT</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-muted">
                      Không có nhân sự phù hợp bộ lọc.
                    </td>
                  </tr>
                )}
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="nx-emp-code">{e.employeeCode}</td>
                    <td>
                      <div className="nx-emp-person">
                        <div className="av">{initials(e.fullName)}</div>
                        <div>
                          <strong>
                            <Link
                              to={`/employees/${e.id}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {e.fullName}
                            </Link>
                          </strong>
                          <span>{e.position || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {e.departmentName ? (
                        <span className="nx-emp-dept">
                          <span className="dot" />
                          {e.departmentName}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="nx-emp-contact">
                        <span>{e.email || '—'}</span>
                        <span className="muted">{e.phone || '—'}</span>
                      </div>
                    </td>
                    <td>{fmtDate(e.hireDate)}</td>
                    <td>
                      {e.status === 'ACTIVE' ? (
                        <span className="nx-emp-st active">Đang làm việc</span>
                      ) : e.status === 'SUSPENDED' ? (
                        <span
                          className="nx-emp-st inactive"
                          style={{ background: '#fff3e0', color: '#e65100' }}
                        >
                          Tạm ngưng
                        </span>
                      ) : (
                        <span className="nx-emp-st inactive">Đã nghỉ việc</span>
                      )}
                    </td>
                    <td>
                      <div className="nx-emp-acc">
                        {!e.account.linked && (
                          <span className="none">Chưa cấp TK</span>
                        )}
                        {e.account.linked && e.account.locked && (
                          <>
                            <div className="locked">Tài khoản bị khóa</div>
                            <span
                              className={`role ${e.account.role.toLowerCase()}`}
                            >
                              {e.account.role}
                            </span>
                          </>
                        )}
                        {e.account.linked && !e.account.locked && (
                          <>
                            <div className="ok">
                              Đã cấp TK · @{e.account.username}
                            </div>
                            <span
                              className={`role ${e.account.role.toLowerCase()}`}
                            >
                              {e.account.role}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="nx-emp-acts">
                        {e.account.linked && (
                          <Link
                            to={`/users/${e.account.id}`}
                            className="nx-icon-act"
                            title="Xem tài khoản"
                            style={{ textDecoration: 'none' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </Link>
                        )}
                        <Link
                          to={`/employees/${e.id}`}
                          className="nx-icon-act"
                          title="Chi tiết / sửa hồ sơ"
                          style={{ textDecoration: 'none' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 20h4L18 10l-4-4L4 16v4Z" />
                          </svg>
                        </Link>
                        {canManage &&
                          (e.status === 'INACTIVE' ||
                            e.status === 'SUSPENDED') && (
                            <button
                              type="button"
                              className="nx-icon-act unlock"
                              title="Khôi phục đang làm việc"
                              onClick={() => void restore(e)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5" />
                                <path d="M18 3v5h-5M6 21v-5h5" />
                              </svg>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="nx-emp-pager">
          <div className="nx-emp-pager-info">
            Hiển thị {rangeStart}–{rangeEnd} trong tổng số {total} nhân sự
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#6f7976' }}>
              Mỗi trang
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="nx-emp-pager-btns">
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
                  {gap && <span>…</span>}
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
