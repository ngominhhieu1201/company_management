import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/tasks.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode?: string;
  position?: string | null;
};

type TaskRow = {
  id: number;
  taskCode: string;
  title: string;
  description: string | null;
  projectName: string | null;
  assignee: Emp | null;
  department: { id: number; name: string; departmentCode: string } | null;
  priority: string;
  status: string;
  progress: number;
  startDate?: string | null;
  dueDate: string | null;
  sla: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function dueLabel(due: string | null, sla: string) {
  if (!due) return null;
  if (sla === 'overdue') return 'Quá hạn';
  if (sla === 'today') return 'Hôm nay';
  if (sla === 'soon') {
    const today = new Date().toISOString().slice(0, 10);
    const diff = Math.round(
      (new Date(due + 'T00:00:00').getTime() -
        new Date(today + 'T00:00:00').getTime()) /
        86400000,
    );
    return diff > 0 ? `Còn ${diff} ngày` : 'Sắp hạn';
  }
  return null;
}

type Stats = {
  total: number;
  active: number;
  incomplete?: number;
  inProgress: number;
  review: number;
  todo?: number;
  done?: number;
  donePct?: number;
  doneSprint: number;
  mine: number;
  urgent: number;
  soonSla: number;
  overdue?: number;
  onTimePct?: number;
  avgDays?: number | null;
  scopeDeptCode?: string | null;
  scopeEmployees?: number;
  byPriority: Record<string, number>;
  byStatus?: Record<string, number>;
};

type Dept = { id: number; name: string };

const PRI: Record<string, string> = {
  URGENT: 'Khẩn cấp (P0)',
  HIGH: 'Ưu tiên cao (P1)',
  MEDIUM: 'Trung bình (P2)',
  LOW: 'Thấp (P3)',
};
const ST: Record<string, string> = {
  TODO: 'CHỜ XỬ LÝ',
  IN_PROGRESS: 'ĐANG XỬ LÝ',
  REVIEW: 'REVIEW',
  DONE: 'HOÀN THÀNH',
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function priClass(p: string) {
  if (p === 'URGENT') return 'urgent';
  if (p === 'HIGH') return 'high';
  if (p === 'LOW') return 'low';
  return 'medium';
}
function stClass(s: string) {
  if (s === 'IN_PROGRESS') return 'progress';
  if (s === 'REVIEW') return 'review';
  if (s === 'DONE') return 'done';
  return 'todo';
}

function exportCsv(rows: TaskRow[]) {
  const header = ['Code', 'Title', 'Priority', 'Status', 'Assignee', 'Department', 'Due'];
  const lines = rows.map((r) =>
    [r.taskCode, r.title, r.priority, r.status, r.assignee?.fullName ?? '', r.department?.name ?? '', r.dueDate ?? '']
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexora-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isManager = user?.role === 'MANAGER';

  const [items, setItems] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);

  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [sla, setSla] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [scope, setScope] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [kanbanRows, setKanbanRows] = useState<TaskRow[]>([]);

  const loadStats = useCallback(async () => {
    const { data } = await api.get<Stats>('/tasks/stats');
    setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    const { data } = await api.get<{
      items: TaskRow[];
      total: number;
      page: number;
      totalPages: number;
    }>('/tasks', {
      params: {
        q: q || undefined,
        sla: sla || undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        assigneeId: assigneeId ? Number(assigneeId) : undefined,
        status: status || undefined,
        priority: priority || undefined,
        scope: scope || undefined,
        page,
        pageSize,
        sort: 'due_asc',
      },
    });
    setItems(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setSelected([]);
  }, [q, sla, departmentId, assigneeId, status, priority, scope, page, pageSize]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadStats(), loadList()]);
        setError('');
      } catch {
        if (!c) setError('Không tải được công việc');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [loadStats, loadList]);

  useEffect(() => {
    if (view !== 'kanban') return;
    api
      .get<{ items: TaskRow[] }>('/tasks', {
        params: {
          q: q || undefined,
          sla: sla || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          priority: priority || undefined,
          scope: scope || undefined,
          page: 1,
          pageSize: 100,
        },
      })
      .then((r) => setKanbanRows(r.data.items))
      .catch(() => undefined);
  }, [view, q, sla, departmentId, priority, scope]);

  useEffect(() => {
    api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
    api
      .get('/employees/options')
      .then((r) => setEmps(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qDraft]);

  const byStatus = useMemo(() => {
    const map: Record<string, TaskRow[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [],
    };
    for (const t of kanbanRows) (map[t.status] || (map[t.status] = [])).push(t);
    return map;
  }, [kanbanRows]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? items.map((i) => i.id) : []);
  }
  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  }

  const incomplete = stats?.incomplete ?? stats?.active ?? 0;
  const doneCount = stats?.done ?? stats?.byStatus?.DONE ?? 0;

  return (
    <div>
      <div className="nx-tk-crumb">
        <span>{isManager ? 'Quản trị quản lý' : 'Quản trị hệ thống'}</span>
        <span>›</span>
        <span>Phân hệ Công việc</span>
        <span>›</span>
        <span>Danh sách công việc</span>
      </div>
      <div className="nx-tk-head">
        <div>
          <h1>Quản Lý &amp; Điều Phối Công Việc</h1>
          {isManager && stats && (
            <div className="nx-tk-scope-tags">
              {stats.scopeDeptCode && <span>{stats.scopeDeptCode}</span>}
              <span>{stats.scopeEmployees ?? 0} NHÂN SỰ</span>
            </div>
          )}
        </div>
        <div className="nx-tk-actions">
          <button type="button" className="nx-btn-outline" onClick={() => exportCsv(items)}>
            Xuất báo cáo Excel
          </button>
          {canCreate && (
            <Link to="/tasks/new" className="nx-btn-primary">
              + Tạo công việc mới
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
        <div className="nx-tk-kpis">
          <div className="nx-tk-kpi">
            <div className="ico blue">◎</div>
            <div>
              <div className="label">Tổng công việc</div>
              <div className="value">{stats.total}</div>
              <div className="hint">100% trong phạm vi quản lý</div>
            </div>
          </div>
          <div className="nx-tk-kpi">
            <div className="ico orange">!</div>
            <div>
              <div className="label">Chưa hoàn thành</div>
              <div className="value">{incomplete}</div>
              <div className="hint">
                {stats.urgent} khẩn cấp P0 · {stats.inProgress} đang làm ·{' '}
                {stats.soonSla} cận hạn
              </div>
            </div>
          </div>
          <div className="nx-tk-kpi">
            <div className="ico green">✓</div>
            <div>
              <div className="label">Đã hoàn thành</div>
              <div className="value">{doneCount}</div>
              <div className="hint">
                Tỷ lệ hoàn thành: {stats.donePct ?? 0}% · Sprint tuần:{' '}
                {stats.doneSprint}
              </div>
            </div>
          </div>
          <div className="nx-tk-kpi">
            <div className="ico teal">↗</div>
            <div>
              <div className="label">Hiệu suất bàn giao</div>
              <div className="value">{stats.onTimePct ?? 100}%</div>
              <div className="hint">
                TB xử lý:{' '}
                {stats.avgDays != null ? `${stats.avgDays} ngày/task` : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="nx-tk-filters">
        <label className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Tìm theo tên công việc, mã task (TSK-xxxx)..."
          />
        </label>
        <select
          value={assigneeId}
          onChange={(e) => {
            setAssigneeId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Nhân sự: Tất cả</option>
          {emps.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setScope('');
            setPage(1);
          }}
        >
          <option value="">Trạng thái: Tất cả</option>
          {Object.entries(ST).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={sla}
          onChange={(e) => {
            setSla(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Hạn: Tất cả</option>
          <option value="overdue">Quá hạn</option>
          <option value="soon">Sắp quá hạn</option>
          <option value="today">Hôm nay</option>
          <option value="week">Trong 7 ngày</option>
        </select>
        {!isManager && (
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Khối / Phòng ban</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <div className="nx-tk-view">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            Danh sách
          </button>
          <button type="button" className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>
            Kanban
          </button>
        </div>
      </div>

      <div className="nx-tk-chips">
        <span className="lbl">Lọc nhanh</span>
        <button
          type="button"
          className={`nx-tk-chip${!scope && !sla && !status ? ' active' : ''}`}
          onClick={() => {
            setScope('');
            setSla('');
            setStatus('');
            setPriority('');
            setPage(1);
          }}
        >
          Tất cả ({stats?.total ?? 0})
        </button>
        <button
          type="button"
          className={`nx-tk-chip${scope === 'incomplete' ? ' active' : ''}`}
          onClick={() => {
            setScope('incomplete');
            setStatus('');
            setPage(1);
          }}
        >
          Chưa hoàn thành ({incomplete})
        </button>
        <button
          type="button"
          className={`nx-tk-chip${scope === 'done' ? ' active' : ''}`}
          onClick={() => {
            setScope('done');
            setStatus('');
            setPage(1);
          }}
        >
          Đã hoàn thành ({doneCount})
        </button>
        <button
          type="button"
          className={`nx-tk-chip${scope === 'mine' ? ' active' : ''}`}
          onClick={() => {
            setScope('mine');
            setPage(1);
          }}
        >
          Việc của tôi ({stats?.mine ?? 0})
        </button>
        <button
          type="button"
          className={`nx-tk-chip${scope === 'urgent' ? ' active' : ''}`}
          onClick={() => {
            setScope('urgent');
            setPage(1);
          }}
        >
          Khẩn cấp P0 ({stats?.urgent ?? 0})
        </button>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <Spinner animation="border" size="sm" />
        </div>
      ) : view === 'list' ? (
        <div className="nx-tk-wrap">
          <table className="nx-tk-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.length === items.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th>Mã &amp; tên công việc</th>
                <th>Người thực hiện</th>
                <th>Bắt đầu</th>
                <th>Hạn hoàn thành</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#7a8a85' }}>
                    Không có công việc
                  </td>
                </tr>
              )}
              {items.map((t) => {
                const hint = dueLabel(t.dueDate, t.sla);
                return (
                  <tr key={t.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(t.id)}
                        onChange={(e) => toggleOne(t.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <div className="nx-tk-title">
                        <span className="nx-tk-code">
                          {t.taskCode}
                          <em className={`nx-tk-pri ${priClass(t.priority)}`}>
                            {t.priority === 'URGENT'
                              ? 'P0'
                              : t.priority === 'HIGH'
                                ? 'P1'
                                : t.priority === 'LOW'
                                  ? 'P3'
                                  : 'P2'}
                          </em>
                        </span>
                        <strong>{t.title}</strong>
                        <div className="desc">
                          {t.projectName || t.department?.name || '—'}
                        </div>
                      </div>
                    </td>
                    <td>
                      {t.assignee ? (
                        <div className="nx-tk-who">
                          <div className="nx-tk-av">
                            {initials(t.assignee.fullName)}
                          </div>
                          <div>
                            <strong>{t.assignee.fullName}</strong>
                            <span>
                              {t.assignee.position || t.assignee.employeeCode}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#7a8a85' }}>—</span>
                      )}
                    </td>
                    <td>{fmtDate(t.startDate)}</td>
                    <td>
                      <strong>{fmtDate(t.dueDate)}</strong>
                      {hint && (
                        <div
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color:
                              t.sla === 'overdue' ? '#c62828' : '#e65100',
                          }}
                        >
                          {hint}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`nx-tk-st ${stClass(t.status)}`}>
                        {t.status === 'DONE'
                          ? 'DONE'
                          : t.status === 'TODO'
                            ? 'TODO'
                            : ST[t.status] || t.status}
                      </span>
                    </td>
                    <td>
                      <div className="nx-tk-row-acts">
                        <Link
                          to={`/tasks/${t.id}`}
                          className="nx-icon-act"
                          title="Xem"
                          aria-label={`Xem ${t.taskCode}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span className="visually-hidden">Xem</span>
                        </Link>
                        <Link
                          to={`/tasks/${t.id}`}
                          className="nx-btn-outline"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          Chi tiết
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="nx-tk-pager">
            <div>
              Hiển thị {(page - 1) * pageSize + (total ? 1 : 0)}–
              {Math.min(page * pageSize, total)} trong tổng số {total} công việc
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
              >
                <option value={8}>8 / trang</option>
                <option value={10}>10 / trang</option>
                <option value={25}>25 / trang</option>
              </select>
            </div>
            <div className="btns">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(Math.max(0, page - 3), page + 2)
                .map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={p === page ? 'active' : ''}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="nx-tk-kanban">
          {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const).map((col) => (
            <div key={col} className="nx-tk-col">
              <h3>
                <span>{ST[col]}</span>
                <span>{byStatus[col]?.length || 0}</span>
              </h3>
              {(byStatus[col] || []).map((t) => (
                <div
                  key={t.id}
                  className="nx-tk-kcard"
                  onClick={() => navigate(`/tasks/${t.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/tasks/${t.id}`)}
                >
                  <div className="code">{t.taskCode}</div>
                  <strong>{t.title}</strong>
                  <span className={`nx-tk-pri ${priClass(t.priority)}`}>{PRI[t.priority]}</span>
                  <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#7a8a85' }}>
                    {t.assignee?.fullName || 'Chưa gán'}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
