import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/departments.css';

type Manager = {
  id: number;
  fullName: string;
  employeeCode: string;
  position: string | null;
  email: string;
  hireDate: string | null;
};

type DeptRow = {
  id: number;
  departmentCode: string;
  name: string;
  description: string | null;
  managerEmployeeId: number | null;
  manager: Manager | null;
  headcount: number;
  headcountTarget: number | null;
  fillPct: number | null;
  foundedAt: string | null;
  yearsActive: string | null;
  location: string | null;
  category: string | null;
  status: string;
};

type DeptDetail = DeptRow & {
  members: {
    id: number;
    employeeCode: string;
    fullName: string;
    position: string | null;
    email: string;
    status: string;
  }[];
};

type Stats = {
  total: number;
  active: number;
  headcount: number;
  headcountTargetSum: number | null;
  fillPct: number | null;
  largest: {
    id: number;
    name: string;
    departmentCode: string;
    headcount: number;
  } | null;
  byCategory: Record<string, number>;
};

const CATEGORY_LABEL: Record<string, string> = {
  ENGINEERING: 'Kỹ thuật & R&D',
  BUSINESS: 'Kinh doanh',
  SUPPORT: 'Hỗ trợ & Vận hành',
  OTHER: 'Khác',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'ADMIN';

  const [rows, setRows] = useState<DeptRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [detail, setDetail] = useState<DeptDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('size_desc');

  const loadStats = useCallback(async () => {
    const { data } = await api.get<Stats>('/departments/stats');
    setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    const { data } = await api.get<DeptRow[]>('/departments', {
      params: {
        q: q || undefined,
        status: status || undefined,
        category: category || undefined,
        sort,
      },
    });
    setRows(data);
  }, [q, status, category, sort]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get<DeptDetail>(`/departments/${id}`);
      setDetail(data);
      setSelectedId(id);
    } catch {
      setError('Không tải được chi tiết phòng ban');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([loadStats(), loadList()]);
      } catch {
        if (!cancelled) setError('Không tải được danh sách phòng ban');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStats, loadList]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qDraft.trim()), 300);
    return () => clearTimeout(t);
  }, [qDraft]);

  useEffect(() => {
    if (rows.length === 0) {
      setDetail(null);
      setSelectedId(null);
      return;
    }
    const stillValid = selectedId != null && rows.some((r) => r.id === selectedId);
    const id = stillValid ? selectedId! : rows[0].id;
    void loadDetail(id);
    // Only auto-select when list contents change (filters/reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, loadDetail]);

  const categoryChips = useMemo(() => {
    const by = stats?.byCategory || {};
    const keys = Object.keys(by).filter((k) => by[k] > 0);
    return keys.sort();
  }, [stats]);

  async function toggleStatus() {
    if (!detail || !canManage) return;
    const next =
      detail.status === 'ACTIVE' || detail.status === 'DRAFT'
        ? 'INACTIVE'
        : 'ACTIVE';
    const label =
      next === 'INACTIVE'
        ? 'Tạm ngừng hoạt động khối này?'
        : 'Kích hoạt lại phòng ban?';
    if (!window.confirm(label)) return;
    try {
      const { data } = await api.patch<DeptDetail>(`/departments/${detail.id}`, {
        status: next,
      });
      await Promise.all([loadStats(), loadList()]);
      setDetail(data);
    } catch {
      setError('Đổi trạng thái thất bại');
    }
  }

  return (
    <div>
      <div className="nx-dept-crumb">
        <span>Quản trị hệ thống</span>
        <span>›</span>
        <span>Quản lý phòng ban</span>
      </div>

      <div className="nx-dept-head">
        <h1>Quản Lý Cơ Cấu Phòng Ban & Tổ Chức</h1>
        {canManage && (
          <Link to="/departments/new" className="nx-btn-primary">
            + Thêm phòng ban mới
          </Link>
        )}
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {stats && (
        <div className="nx-dept-kpis">
          <div className="nx-dept-kpi">
            <div className="label">Tổng phòng ban</div>
            <div className="value">{stats.total}</div>
            <div className="hint">{stats.active} đang hoạt động</div>
          </div>
          <div className="nx-dept-kpi">
            <div className="label">Tổng nhân sự</div>
            <div className="value">
              {stats.headcount}
              {stats.headcountTargetSum != null
                ? ` / ${stats.headcountTargetSum}`
                : ''}{' '}
              NS
            </div>
            <div className="hint">
              {stats.fillPct != null
                ? `${stats.fillPct}% định biên`
                : 'Chưa cấu hình định biên'}
            </div>
          </div>
          <div className="nx-dept-kpi">
            <div className="label">Khối lớn nhất</div>
            <div className="value" style={{ fontSize: '1.05rem' }}>
              {stats.largest?.name ?? '—'}
            </div>
            <div className="hint">
              {stats.largest
                ? `${stats.largest.headcount} NS · ${stats.largest.departmentCode}`
                : 'Chưa có dữ liệu'}
            </div>
          </div>
          <div className="nx-dept-kpi">
            <div className="label">Hiệu suất định biên</div>
            <div className="value">
              {stats.fillPct != null ? `${stats.fillPct}%` : '—'}
            </div>
            <div className="hint">
              {stats.fillPct != null
                ? stats.fillPct >= 90
                  ? 'Đạt chuẩn'
                  : 'Cần bổ sung'
                : 'Thiết lập mục tiêu NS'}
            </div>
          </div>
        </div>
      )}

      <div className="nx-dept-filters">
        <label className="search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Tìm theo mã phòng ban, tên khối, trưởng ban..."
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">
            Trạng thái: Tất cả ({stats?.total ?? rows.length})
          </option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="INACTIVE">Tạm ngừng</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="size_desc">Sắp xếp: Quy mô giảm dần</option>
          <option value="size_asc">Sắp xếp: Quy mô tăng dần</option>
          <option value="name_asc">Sắp xếp: Tên A–Z</option>
          <option value="code_asc">Sắp xếp: Mã A–Z</option>
        </select>
      </div>

      <div className="nx-dept-chips">
        <button
          type="button"
          className={`nx-dept-chip${!category ? ' active' : ''}`}
          onClick={() => setCategory('')}
        >
          Tất cả ({stats?.total ?? 0})
        </button>
        {categoryChips.map((key) => (
          <button
            key={key}
            type="button"
            className={`nx-dept-chip${category === key ? ' active' : ''}`}
            onClick={() => setCategory(key)}
          >
            {CATEGORY_LABEL[key] || key} ({stats?.byCategory?.[key] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <Spinner animation="border" size="sm" />
        </div>
      ) : (
        <div className={`nx-dept-layout${detail ? '' : ' solo'}`}>
          <div className="nx-dept-wrap">
            <h2>Danh Sách Khối Ban & Định Biên Hoạt Động</h2>
            <table className="nx-dept-table">
              <thead>
                <tr>
                  <th>Mã PB</th>
                  <th>Phòng ban & Khối</th>
                  <th>Người phụ trách</th>
                  <th>Định biên & Quy mô</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#7a8a85' }}>
                      Không có phòng ban phù hợp
                    </td>
                  </tr>
                )}
                {rows.map((d) => {
                  const pct =
                    d.fillPct != null
                      ? Math.min(100, Math.max(0, d.fillPct))
                      : d.headcount > 0
                        ? 100
                        : 0;
                  return (
                    <tr
                      key={d.id}
                      className={selectedId === d.id ? 'selected' : ''}
                      onClick={() => navigate(`/departments/${d.id}`)}
                    >
                      <td className="nx-dept-code">{d.departmentCode}</td>
                      <td className="nx-dept-name">
                        <strong>{d.name}</strong>
                        <span>
                          {d.category
                            ? CATEGORY_LABEL[d.category] || d.category
                            : d.description || '—'}
                        </span>
                      </td>
                      <td className="nx-dept-mgr">
                        {d.manager ? (
                          <>
                            <strong>{d.manager.fullName}</strong>
                            <span>
                              {d.manager.position || d.manager.employeeCode}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: '#7a8a85' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="nx-dept-scale">
                          <div className="nums">
                            {d.headcount}
                            {d.headcountTarget != null
                              ? ` / ${d.headcountTarget}`
                              : ''}{' '}
                            NS
                            {d.fillPct != null ? ` (${d.fillPct}%)` : ''}
                          </div>
                          <div className="bar">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`nx-dept-st ${
                            d.status === 'ACTIVE'
                              ? 'on'
                              : d.status === 'DRAFT'
                                ? 'draft'
                                : 'off'
                          }`}
                        >
                          {d.status === 'ACTIVE'
                            ? 'HOẠT ĐỘNG'
                            : d.status === 'DRAFT'
                              ? 'BẢN NHÁP'
                              : 'TẠM NGỪNG'}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Link
                          to={`/departments/${d.id}`}
                          className="nx-icon-act"
                          title="Xem chi tiết"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Link>
                        {canManage && (
                          <Link
                            to={`/departments/${d.id}`}
                            className="nx-icon-act"
                            title="Cập nhật"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {detail && (
            <aside className="nx-dept-panel">
              {detailLoading ? (
                <div className="py-4 text-center">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : (
                <>
                  <div className="code-row">
                    <strong style={{ letterSpacing: '0.04em' }}>
                      {detail.departmentCode}
                    </strong>
                    <span
                      className={`nx-dept-st ${
                        detail.status === 'ACTIVE'
                          ? 'on'
                          : detail.status === 'DRAFT'
                            ? 'draft'
                            : 'off'
                      }`}
                    >
                      {detail.status}
                    </span>
                  </div>
                  <h3>{detail.name}</h3>

                  <div className="meta">
                    <div>
                      <span>Quy mô</span>
                      {detail.headcount} NS
                      {detail.headcountTarget != null
                        ? ` (Mục tiêu: ${detail.headcountTarget})`
                        : ''}
                    </div>
                    <div>
                      <span>Ngày thành lập</span>
                      {formatDate(detail.foundedAt)}
                      {detail.yearsActive ? ` (${detail.yearsActive})` : ''}
                    </div>
                    <div>
                      <span>Địa điểm</span>
                      {detail.location || '—'}
                    </div>
                    {detail.category && (
                      <div>
                        <span>Khối</span>
                        {CATEGORY_LABEL[detail.category] || detail.category}
                      </div>
                    )}
                  </div>

                  <div className="mgr-box">
                    {detail.manager ? (
                      <>
                        <strong>{detail.manager.fullName}</strong>
                        <span>
                          {detail.manager.position || 'Phụ trách'} ·{' '}
                          {detail.manager.employeeCode}
                          {detail.manager.hireDate
                            ? ` · từ ${formatDate(detail.manager.hireDate)}`
                            : ''}
                        </span>
                      </>
                    ) : (
                      <span>Chưa gán người phụ trách</span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#7a8a85',
                      marginBottom: '0.35rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Nhân sự đang hoạt động ({detail.members.length})
                  </div>
                  <ul className="nx-dept-members">
                    {detail.members.length === 0 && (
                      <li>
                        <span style={{ color: '#7a8a85' }}>Chưa có nhân sự</span>
                      </li>
                    )}
                    {detail.members.map((m) => (
                      <li key={m.id}>
                        <span>
                          <strong>{m.fullName}</strong>
                          <br />
                          <span style={{ color: '#7a8a85', fontSize: '0.75rem' }}>
                            {m.position || m.employeeCode}
                          </span>
                        </span>
                        <span style={{ color: '#7a8a85', fontSize: '0.75rem' }}>
                          {m.employeeCode}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="nx-dept-panel-actions">
                    <Link
                      to={`/departments/${detail.id}`}
                      className="nx-btn-primary"
                      style={{ textAlign: 'center', justifyContent: 'center' }}
                    >
                      {canManage ? 'Cập nhật phòng ban' : 'Xem chi tiết'}
                    </Link>
                    {canManage && (
                      <button
                        type="button"
                        className="nx-dept-danger-link"
                        onClick={() => void toggleStatus()}
                      >
                        {detail.status === 'INACTIVE'
                          ? 'Kích hoạt lại phòng ban'
                          : 'Tạm ngừng hoạt động khối này'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      )}

    </div>
  );
}
