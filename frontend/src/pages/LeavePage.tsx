import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import EmployeeLeavePage from './EmployeeLeavePage';
import '../styles/leave.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
  attachmentName: string | null;
  attachmentKey?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  employee: {
    fullName: string;
    employeeCode: string;
    position?: string | null;
  } | null;
  department: { name: string } | null;
  handover: { fullName: string } | null;
};

type Stats = {
  total: number;
  pending: number;
  pendingUrgent: number;
  approvedMonth: number;
  rejected: number;
  rejectedPct: number;
  onLeaveToday: number;
  avgResponseHours?: number | null;
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

const ST_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
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
  const header = ['Code', 'Employee', 'Type', 'Start', 'End', 'Days', 'Status', 'Handover', 'Attachment'];
  const lines = rows.map((r) =>
    [
      r.leaveCode,
      r.employee?.fullName ?? '',
      r.leaveType,
      r.startDate,
      r.endDate,
      r.daysCount,
      r.status,
      r.handover?.fullName ?? '',
      r.attachmentName ?? '',
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
  a.download = 'nexora-leave.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeavePage() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') {
    return <EmployeeLeavePage />;
  }
  return <ManagerLeavePage />;
}

function ManagerLeavePage() {
  const { user } = useAuth();
  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [items, setItems] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [chip, setChip] = useState('all');

  const load = useCallback(async () => {
    const params: Record<string, string | number> = { page, pageSize: 10 };
    if (q) params.q = q;
    if (leaveType) params.leaveType = leaveType;
    if (chip === 'pending') params.status = 'PENDING';
    else if (chip === 'APPROVED' || chip === 'REJECTED') params.status = chip;
    else if (chip === 'SICK') params.leaveType = 'SICK';
    else if (status) params.status = status;

    const [s, list] = await Promise.all([
      api.get<Stats>('/leave/stats'),
      api.get<{ items: Row[]; total: number; totalPages: number }>('/leave', { params }),
    ]);
    setStats(s.data);
    setItems(list.data.items);
    setTotal(list.data.total);
    setTotalPages(list.data.totalPages);
  }, [page, q, status, leaveType, chip]);

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
    return () => {
      c = true;
    };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qDraft]);

  async function quickReview(e: React.MouseEvent, id: number, decision: 'APPROVED' | 'REJECTED') {
    e.stopPropagation();
    if (!canReview) return;
    if (decision === 'REJECTED' && !window.confirm('Từ chối đơn nghỉ này?')) return;
    setActionBusy(id);
    try {
      await api.patch(`/leave/${id}/review`, { decision });
      await load();
    } catch {
      setError('Thao tác phê duyệt thất bại');
    } finally {
      setActionBusy(null);
    }
  }

  const slaDisplay =
    stats?.avgResponseHours != null && stats.avgResponseHours > 0
      ? `${stats.avgResponseHours}h`
      : '—';

  return (
    <div>
      <div className="nx-lv-crumb">
        <span>Quản trị hệ thống</span>
        <span>›</span>
        <span>Quản lý nghỉ phép</span>
      </div>
      <div className="nx-lv-head">
        <h1>Quản Lý &amp; Tiếp Nhận Đơn Nghỉ Phép</h1>
        <div className="nx-lv-actions">
          <button type="button" className="nx-btn-outline" onClick={() => exportCsv(items)}>
            Xuất Excel
          </button>
          <Link to="/leave/new" className="nx-btn-primary">
            + Tạo đơn
          </Link>
        </div>
      </div>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {stats && (
        <div className="nx-lv-kpis">
          <div className="nx-lv-kpi">
            <div className="label">Chờ phê duyệt</div>
            <div className="value">{stats.pending}</div>
            {stats.pendingUrgent > 0 && (
              <span className="badge nx-lv-kpi-warn">Khẩn {stats.pendingUrgent}</span>
            )}
          </div>
          <div className="nx-lv-kpi">
            <div className="label">Đã duyệt tháng</div>
            <div className="value">{stats.approvedMonth}</div>
            <span className="badge">{stats.month}</span>
          </div>
          <div className="nx-lv-kpi">
            <div className="label">Đang vắng hôm nay</div>
            <div className="value">{stats.onLeaveToday}</div>
            <span className="badge">{stats.today}</span>
          </div>
          <div className="nx-lv-kpi">
            <div className="label">SLA phản hồi</div>
            <div className="value">{slaDisplay}</div>
            <span className="badge">TB từ gửi → duyệt</span>
          </div>
        </div>
      )}

      <div className="nx-lv-filters">
        <label className="search">
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Tìm mã đơn OFF-, mã NV, họ tên…"
          />
        </label>
        <select
          value={leaveType}
          onChange={(e) => {
            setLeaveType(e.target.value);
            setChip('all');
            setPage(1);
          }}
        >
          <option value="">Tất cả loại phép</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setChip('all');
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </div>

      <div className="nx-lv-chips">
        {(
          [
            ['all', `Tất cả (${stats?.total ?? 0})`],
            ['pending', `Chờ duyệt (${stats?.pending ?? 0})`],
            ['APPROVED', 'Đã duyệt'],
            ['REJECTED', `Từ chối (${stats?.rejected ?? 0})`],
            ['SICK', `Ốm đau (${stats?.byType?.SICK ?? 0})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`nx-lv-chip${chip === k ? ' active' : ''}`}
            onClick={() => {
              setChip(k);
              setStatus('');
              setLeaveType('');
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <Spinner size="sm" animation="border" />
        </div>
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
                <th>Chứng từ</th>
                <th>Trạng thái</th>
                <th className="nx-lv-th-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="nx-lv-empty">
                    Không có đơn
                  </td>
                </tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="nx-lv-code">#{r.leaveCode}</div>
                    <div className="nx-lv-sub">{fmtDt(r.createdAt)}</div>
                    {r.urgency === 'URGENT' && <span className="nx-lv-urgent-tag">KHẨN</span>}
                  </td>
                  <td>
                    <div className="nx-lv-emp">
                      <div className="nx-lv-avatar">{initials(r.employee?.fullName || '?')}</div>
                      <div>
                        <strong className="nx-lv-emp-name">{r.employee?.fullName}</strong>
                        <span className="nx-lv-sub">
                          {r.employee?.employeeCode}
                          {r.employee?.position ? ` · ${r.employee.position}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`nx-lv-type ${r.leaveType}`}>
                      {TYPE_LABEL[r.leaveType] || r.leaveType}
                    </span>
                  </td>
                  <td>
                    <strong className="nx-lv-dates">
                      {fmt(r.startDate)} – {fmt(r.endDate)}
                    </strong>
                    <span className="nx-lv-sub">{r.daysCount} ngày làm việc</span>
                  </td>
                  <td>{r.handover?.fullName || <span className="nx-lv-muted">Chưa gán</span>}</td>
                  <td>
                    {r.attachmentName ? (
                      r.attachmentKey ? (
                        <a
                          className="nx-lv-attach"
                          href={`${apiBase}/leave/files/${encodeURIComponent(r.attachmentKey)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.attachmentName}
                        </a>
                      ) : (
                        <span className="nx-lv-attach">{r.attachmentName}</span>
                      )
                    ) : (
                      <span className="nx-lv-muted">Không yêu cầu</span>
                    )}
                  </td>
                  <td>
                    <span className={`nx-lv-st ${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
                    {r.status === 'APPROVED' && r.reviewerName && (
                      <div className="nx-lv-sub">Duyệt: {r.reviewerName}</div>
                    )}
                  </td>
                  <td className="nx-lv-actions-cell">
                    {r.status === 'PENDING' && canReview && (
                      <>
                        <button
                          type="button"
                          className="nx-lv-act ok"
                          disabled={actionBusy === r.id}
                          onClick={(e) => void quickReview(e, r.id, 'APPROVED')}
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          className="nx-lv-act no"
                          disabled={actionBusy === r.id}
                          onClick={(e) => void quickReview(e, r.id, 'REJECTED')}
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    <Link
                      to={`/leave/${r.id}`}
                      className="nx-lv-act link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="nx-lv-pager">
            <div>
              Trang {page}/{totalPages} · {total} đơn
            </div>
            <div className="nx-lv-pager-btns">
              <button
                type="button"
                className="nx-btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="nx-btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
