import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/attendance.css';

type Detail = {
  id: number;
  recordCode: string;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInPhotoKey: string | null;
  checkOutPhotoKey: string | null;
  status: string;
  flagged: boolean;
  punctuality: string;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  workMinutes: number | null;
  workUnits: number | null;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  employee: { id: number; fullName: string; employeeCode: string; position?: string | null } | null;
  department: { name: string } | null;
  recentHistory: {
    id: number;
    workDate: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    checkInPhotoKey: string | null;
  }[];
};

const WEEKDAY_VI = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const TARGET_MINUTES = 480;

function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function timeOnly(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtWeekday(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return WEEKDAY_VI[d.getDay()] ?? '';
}

function fmtDurCompact(mins: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

function statusMeta(d: Detail) {
  if (d.punctuality === 'LATE') return { cls: 'late', label: 'LATE' };
  if (d.status === 'IN_PROGRESS') return { cls: 'prog', label: 'IN_PROGRESS' };
  if (d.status === 'COMPLETED') return { cls: 'on', label: 'COMPLETED' };
  return { cls: 'muted', label: d.status || '—' };
}

function punctualityTag(d: Detail) {
  if (d.punctuality === 'LATE' && d.lateMinutes != null) {
    return { cls: 'late', text: `Muộn ${d.lateMinutes} phút` };
  }
  if (d.earlyMinutes != null && d.earlyMinutes > 0) {
    return { cls: 'early', text: `Sớm ${d.earlyMinutes} phút` };
  }
  if (d.checkInTime) return { cls: 'on', text: 'Đúng giờ' };
  return null;
}

export default function AttendanceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [flagging, setFlagging] = useState(false);
  const [error, setError] = useState('');
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get<Detail>(`/attendance/${id}`);
      setDetail(data);
      setError('');
    } catch {
      setError('Không tải được bản ghi');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag() {
    if (!detail || !canManage || flagging) return;
    setFlagging(true);
    try {
      await api.patch(`/attendance/${detail.id}/flag`, { flagged: !detail.flagged });
      await load();
    } catch {
      setError('Gắn cờ thất bại');
    } finally {
      setFlagging(false);
    }
  }

  const photoUrls = useMemo(() => {
    if (!detail) return { in: null as string | null, out: null as string | null };
    return {
      in: detail.checkInPhotoKey ? `${apiBase}/attendance/photo/${detail.checkInPhotoKey}` : null,
      out: detail.checkOutPhotoKey ? `${apiBase}/attendance/photo/${detail.checkOutPhotoKey}` : null,
    };
  }, [detail, apiBase]);

  if (loading) {
    return (
      <div className="py-5 text-center">
        <Spinner size="sm" animation="border" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        <Alert variant="danger">{error || 'Không tìm thấy'}</Alert>
        <Link to="/attendance">← Quay lại danh sách</Link>
      </div>
    );
  }

  const st = statusMeta(detail);
  const pTag = punctualityTag(detail);
  const workMins = detail.workMinutes ?? 0;
  const progressPct = Math.min(100, Math.round((workMins / TARGET_MINUTES) * 100));

  return (
    <div className="nx-ad-page">
      <nav className="nx-att-crumb nx-ad-crumb">
        <Link to="/attendance">Quay lại danh sách</Link>
        <span>›</span>
        <span>Phân hệ Chấm công</span>
        <span>›</span>
        <span className="nx-ad-crumb-here">{detail.recordCode}</span>
      </nav>

      <div className="nx-att-head nx-ad-head">
        <div className="nx-ad-head-main">
          <h1>Chi Tiết Bản Ghi Chấm Công: {detail.employee?.fullName ?? '—'}</h1>
          <div className="nx-ad-badges">
            <span className="nx-att-code">{detail.employee?.employeeCode}</span>
            <span className={`nx-att-st ${st.cls}`}>{st.label}</span>
            {detail.flagged && <span className="nx-att-st flag">CẦN ĐỐI SOÁT</span>}
            <span className="nx-ad-badge-date">
              {fmtDate(detail.workDate)} · {fmtWeekday(detail.workDate)}
            </span>
            <span className="nx-ad-badge-shift">
              {detail.shiftLabel} ({detail.shiftStart} – {detail.shiftEnd})
            </span>
            {detail.department?.name && (
              <span className="nx-att-dept">{detail.department.name}</span>
            )}
          </div>
        </div>
        <div className="nx-att-head-actions">
          {canManage && (
            <>
              <button
                type="button"
                className={detail.flagged ? 'nx-btn-outline nx-ad-btn-flag on' : 'nx-btn-primary nx-ad-btn-flag'}
                disabled={flagging}
                onClick={() => void toggleFlag()}
              >
                {detail.flagged ? 'Đã gắn cờ đối soát' : 'Yêu cầu giải trình'}
              </button>
              <button type="button" className="nx-btn-outline" disabled title="Chưa hỗ trợ API">
                Điều chỉnh (chưa hỗ trợ API)
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="nx-ad-layout nx-ad-layout-mgr">
        <div className="nx-ad-main">
          <section className="nx-ad-card nx-ad-summary">
            <div className="nx-ad-hero">
              <div className="av lg">{initials(detail.employee?.fullName || '?')}</div>
              <div className="nx-ad-summary-body">
                <h2>{detail.employee?.fullName}</h2>
                <p className="nx-ad-summary-meta">
                  {detail.employee?.position || '—'}
                  {detail.department?.name ? ` · ${detail.department.name}` : ''}
                </p>
                <div className="nx-ad-accum">
                  <div className="nx-ad-accum-label">Thời gian tích lũy trong ca</div>
                  <div className="nx-ad-accum-value">
                    <strong>{fmtDurCompact(detail.workMinutes)}</strong>
                    <span>/ {fmtDurCompact(TARGET_MINUTES)}</span>
                  </div>
                  <div className="nx-ad-progress" aria-hidden>
                    <div className="nx-ad-progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="nx-ad-progress-caption">{progressPct}% mục tiêu ca 8 giờ</div>
                </div>
              </div>
            </div>
            <div className="nx-ad-timeline">
              <div className="nx-ad-timeline-point in">
                <span className="dot" />
                <div>
                  <div className="nx-ad-timeline-title">Check-in</div>
                  <div className="nx-ad-timeline-time">{timeOnly(detail.checkInTime)}</div>
                  {pTag && <span className={`nx-att-tag ${pTag.cls}`}>{pTag.text}</span>}
                </div>
              </div>
              <div className="nx-ad-timeline-rail" />
              <div className="nx-ad-timeline-point out">
                <span className="dot" />
                <div>
                  <div className="nx-ad-timeline-title">Kết thúc ca dự kiến</div>
                  <div className="nx-ad-timeline-time">{detail.shiftEnd}</div>
                  <div className="nx-ad-timeline-sub">
                    {detail.status === 'IN_PROGRESS'
                      ? 'Đang trong ca — chưa check-out'
                      : `Check-out: ${timeOnly(detail.checkOutTime)}`}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="nx-ad-events">
            <section className="nx-ad-card nx-ad-event valid">
              <div className="nx-ad-event-head">
                <h3>Check-in</h3>
                <span className="nx-ad-event-pill ok">{detail.checkInTime ? 'HỢP LỆ' : 'CHƯA GHI NHẬN'}</span>
              </div>
              <p className="nx-ad-event-time">{timeOnly(detail.checkInTime)}</p>
              <p className="nx-ad-event-sub">Ca {detail.shiftLabel} · bắt đầu {detail.shiftStart}</p>
            </section>
            <section className={`nx-ad-card nx-ad-event ${detail.checkOutTime ? 'valid' : 'pending'}`}>
              <div className="nx-ad-event-head">
                <h3>Check-out</h3>
                <span className={`nx-ad-event-pill ${detail.checkOutTime ? 'ok' : 'wait'}`}>
                  {detail.checkOutTime ? 'HỢP LỆ' : 'CHƯA GHI NHẬN'}
                </span>
              </div>
              <p className="nx-ad-event-time">
                {detail.checkOutTime ? timeOnly(detail.checkOutTime) : '—'}
              </p>
              <p className="nx-ad-event-sub">
                {detail.workUnits != null
                  ? `Quy đổi: ${detail.workUnits} công · ${fmtDurCompact(detail.workMinutes)}`
                  : 'Chưa có dữ liệu quy đổi công'}
              </p>
            </section>
          </div>

          <section className={`nx-ad-card nx-ad-note ${detail.flagged ? 'flagged' : ''}`}>
            <h3>Ghi chú quản lý</h3>
            {detail.flagged ? (
              <p>Bản ghi đã gắn cờ đối soát bởi quản lý</p>
            ) : (
              <p className="muted">
                Check-in được ghi nhận qua camera trực tiếp trên thiết bị (theo SRS). Ảnh và timestamp
                được lưu đồng bộ từ máy chủ.
              </p>
            )}
          </section>

          <section className="nx-ad-card nx-ad-audit">
            <h3>Nhật ký & lịch sử gần đây</h3>
            <ul className="nx-ad-audit-log">
              {detail.checkInTime && (
                <li>
                  <span className="nx-ad-audit-kind in">Vào ca</span>
                  <span>{new Date(detail.checkInTime).toLocaleString('vi-VN')}</span>
                </li>
              )}
              {detail.checkOutTime ? (
                <li>
                  <span className="nx-ad-audit-kind out">Ra ca</span>
                  <span>{new Date(detail.checkOutTime).toLocaleString('vi-VN')}</span>
                </li>
              ) : (
                <li className="muted">
                  <span className="nx-ad-audit-kind wait">Ra ca</span>
                  <span>Chưa ghi nhận check-out</span>
                </li>
              )}
            </ul>
            <table className="nx-ad-hist nx-ad-hist-full">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Vào</th>
                  <th>Ra</th>
                  <th>Ảnh vào</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentHistory.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link to={`/attendance/${h.id}`}>{fmtDate(h.workDate)}</Link>
                    </td>
                    <td>{timeOnly(h.checkInTime)}</td>
                    <td>{timeOnly(h.checkOutTime)}</td>
                    <td>{h.checkInPhotoKey ? '✓' : '—'}</td>
                  </tr>
                ))}
                {detail.recentHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="nx-att-muted">
                      Chưa có lịch sử
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="nx-ad-aside">
          <section className="nx-ad-card nx-ad-evidence">
            <h3>Bằng chứng ảnh</h3>
            <div className="nx-ad-evidence-block">
              <div className="nx-ad-evidence-label">Ảnh check-in</div>
              <div className="nx-ad-photo sm">
                {photoUrls.in ? (
                  <>
                    <img src={photoUrls.in} alt="Ảnh check-in" />
                    <div className="tag">HỢP LỆ</div>
                  </>
                ) : (
                  <div className="nx-ad-photo-empty">Không có ảnh check-in</div>
                )}
              </div>
            </div>
            <div className="nx-ad-evidence-block">
              <div className="nx-ad-evidence-label">Ảnh check-out</div>
              <div className="nx-ad-photo sm">
                {photoUrls.out ? (
                  <>
                    <img src={photoUrls.out} alt="Ảnh check-out" />
                    <div className="tag">HỢP LỆ</div>
                  </>
                ) : (
                  <div className="nx-ad-photo-empty wait">Chờ ảnh check-out</div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
