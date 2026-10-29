import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import '../styles/leave.css';

type Row = {
  id: number;
  leaveCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  urgency: string;
  reason: string | null;
  createdAt: string;
  employee: { fullName: string; employeeCode: string; position?: string | null } | null;
  department: { name: string } | null;
  handover: { fullName: string } | null;
  quota: { remaining: number; annualQuota: number };
};

type Stats = {
  total: number;
  pending: number;
  pendingUrgent: number;
  approvedMonth: number;
  rejected: number;
  rejectedPct: number;
  onLeaveToday: number;
  byType: Record<string, number>;
  month: string;
  today: string;
};

const TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Phép năm (AL)',
  SICK: 'Ốm đau BHXH',
  UNPAID: 'Không lương',
  OTHER: 'Việc riêng',
};

function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function fmtDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmt(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function exportCsv(rows: Row[]) {
  const header = ['Code', 'Employee', 'Type', 'Start', 'End', 'Days', 'Status'];
  const lines = rows.map((r) =>
    [r.leaveCode, r.employee?.fullName ?? '', r.leaveType, r.startDate, r.endDate, r.daysCount, r.status]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexora-leave.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeavePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [chip, setChip] = useState('all');

  const load = useCallback(async () => {
    const params: Record<string, string | number> = { page, pageSize: 10 };
    if (q) params.q = q;
    if (status) params.status = status;
    if (leaveType) params.leaveType = leaveType;
    if (departmentId) params.departmentId = Number(departmentId);
    if (chip === 'pending') params.status = 'PENDING';
    if (chip === 'ANNUAL' || chip === 'SICK' || chip === 'OTHER') params.leaveType = chip;

    const [s, list] = await Promise.all([
      api.get<Stats>('/leave/stats'),
      api.get<{ items: Row[]; total: number; totalPages: number }>('/leave', { params }),
    ]);
    setStats(s.data);
    setItems(list.data.items);
    setTotal(list.data.total);
    setTotalPages(list.data.totalPages);
  }, [page, q, status, leaveType, departmentId, chip]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
        setError('');
      } catch {
        if (!c) setError('Không tải được đơn nghỉ');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [load]);

  useEffect(() => {
    api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qDraft.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qDraft]);

  return (
    <div>
      <div className="nx-lv-crumb">
        <span>Quản trị hệ thống</span><span>›</span><span>Quản lý nghỉ phép</span>
      </div>
      <div className="nx-lv-head">
        <h1>Quản Lý Đơn Nghỉ Phép & Phê Duyệt Toàn Doanh Nghiệp</h1>
        <div className="nx-lv-actions">
          <button type="button" className="nx-btn-outline" onClick={() => exportCsv(items)}>Xuất báo cáo</button>
          <Link to="/leave/new" className="nx-btn-primary">+ Tạo đơn mới</Link>
        </div>
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {stats && (
        <div className="nx-lv-kpis">
          <div className="nx-lv-kpi">
            <div className="label">Đơn chờ phê duyệt</div>
            <div className="value">{stats.pending}</div>
            <span className="badge">ƯU TIÊN {stats.pendingUrgent}</span>
          </div>
          <div className="nx-lv-kpi">
            <div className="label">Đã phê duyệt tháng này</div>
            <div className="value">{stats.approvedMonth}</div>
            <span className="badge">{stats.month}</span>
          </div>
          <div className="nx-lv-kpi">
            <div className="label">Từ chối</div>
            <div className="value">{stats.rejected}</div>
            <span className="badge">{stats.rejectedPct}%</span>
          </div>
          <div className="nx-lv-kpi">
            <div className="label">Đang nghỉ hôm nay</div>
            <div className="value">{stats.onLeaveToday}</div>
            <span className="badge">{stats.today}</span>
          </div>
        </div>
      )}

      <div className="nx-lv-filters">
        <label className="search">
          <input value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Tìm mã đơn OFF-, mã NV, họ tên…" />
        </label>
        <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
          <option value="">Tất cả phòng ban</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={leaveType} onChange={(e) => { setLeaveType(e.target.value); setChip('all'); setPage(1); }}>
          <option value="">Tất cả loại phép</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setChip('all'); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </div>

      <div className="nx-lv-chips">
        {[
          ['all', `Tất cả (${stats?.total ?? 0})`],
          ['pending', `Chờ duyệt (${stats?.pending ?? 0})`],
          ['ANNUAL', `Phép năm (${stats?.byType?.ANNUAL ?? 0})`],
          ['SICK', `Ốm đau (${stats?.byType?.SICK ?? 0})`],
          ['OTHER', `Việc riêng (${stats?.byType?.OTHER ?? 0})`],
        ].map(([k, label]) => (
          <button key={k} type="button" className={`nx-lv-chip${chip === k ? ' active' : ''}`} onClick={() => { setChip(k); setStatus(''); setLeaveType(''); setPage(1); }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>
      ) : (
        <div className="nx-lv-wrap">
          <table className="nx-lv-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Nhân viên</th>
                <th>Loại</th>
                <th>Thời gian</th>
                <th>Bàn giao</th>
                <th>Quỹ phép năm</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#7a8a85' }}>Không có đơn</td></tr>}
              {items.map((r) => {
                const remPct = Math.round((r.quota.remaining / Math.max(1, r.quota.annualQuota)) * 100);
                return (
                  <tr key={r.id} onClick={() => navigate(`/leave/${r.id}`)}>
                    <td>
                      <div className="nx-lv-code">#{r.leaveCode}</div>
                      <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>{fmtDt(r.createdAt)}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#004036', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>
                          {initials(r.employee?.fullName || '?')}
                        </div>
                        <div>
                          <strong style={{ display: 'block' }}>{r.employee?.fullName}</strong>
                          <span style={{ fontSize: '.72rem', color: '#7a8a85' }}>{r.employee?.employeeCode} · {r.department?.name || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`nx-lv-type ${r.leaveType}`}>{TYPE_LABEL[r.leaveType] || r.leaveType}</span>
                      {r.urgency === 'URGENT' && <div style={{ fontSize: '.7rem', color: '#c62828', fontWeight: 700 }}>Khẩn</div>}
                    </td>
                    <td>
                      <strong style={{ display: 'block' }}>{fmt(r.startDate)} – {fmt(r.endDate)}</strong>
                      <span style={{ fontSize: '.75rem', color: '#7a8a85' }}>{r.daysCount} ngày làm việc</span>
                    </td>
                    <td>{r.handover?.fullName || <span style={{ color: '#7a8a85' }}>Chưa gán</span>}</td>
                    <td>
                      <div style={{ fontSize: '.82rem', fontWeight: 700 }}>Còn {r.quota.remaining}/{r.quota.annualQuota}</div>
                      <div className="nx-lv-bar"><i style={{ width: `${remPct}%` }} /></div>
                    </td>
                    <td><span className={`nx-lv-st ${r.status}`}>{r.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="nx-lv-pager">
            <div>Trang {page}/{totalPages} · {total} đơn</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="nx-btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <button type="button" className="nx-btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
