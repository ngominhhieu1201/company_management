import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/leave.css';

type Detail = {
  id: number;
  leaveCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  status: string;
  urgency: string;
  attachmentName: string | null;
  reviewComment: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  employee: {
    fullName: string;
    employeeCode: string;
    position?: string | null;
    email?: string;
    hireDate?: string | null;
  } | null;
  department: { name: string } | null;
  handover: { fullName: string; position?: string | null } | null;
  quota: {
    annualQuota: number;
    used: number;
    remaining: number;
    remainingAfter: number;
    thisRequest: number;
  };
  audit: { id: number; action: string; createdAt: string; actorUsername: string }[];
};

type Stats = { onLeaveToday: number; today: string };

const TYPE: Record<string, string> = {
  ANNUAL: 'Phép năm (AL)',
  SICK: 'Ốm đau BHXH',
  UNPAID: 'Không lương',
  OTHER: 'Việc riêng',
};

const ST: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime()) && String(iso).includes('T')) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const [y, m, day] = String(iso).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function auditLabel(action: string) {
  if (action === 'LEAVE_CREATE') return 'Tạo đơn nghỉ phép';
  if (action === 'LEAVE_APPROVED') return 'Phê duyệt đơn';
  if (action === 'LEAVE_REJECTED') return 'Từ chối đơn';
  return action;
}

export default function LeaveDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auditRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, statsRes] = await Promise.all([
        api.get<Detail>(`/leave/${id}`),
        api.get<Stats>('/leave/stats').catch(() => ({ data: null })),
      ]);
      setDetail(detailRes.data);
      setComment(detailRes.data.reviewComment || '');
      setStats(statsRes.data);
      setError('');
    } catch {
      setError('Không tải được đơn');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (!detail) return;
    if (decision === 'REJECTED' && !comment.trim() && !window.confirm('Từ chối không kèm nhận xét?')) {
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/leave/${detail.id}/review`, {
        decision,
        comment: comment.trim() || undefined,
      });
      setOk(decision === 'APPROVED' ? 'Đã chấp thuận đơn' : 'Đã từ chối đơn');
      await load();
    } catch {
      setError('Phê duyệt thất bại');
    } finally {
      setSaving(false);
    }
  }

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
        <Link to="/leave">← Quay lại danh sách</Link>
      </div>
    );
  }

  const eligible = detail.quota.remainingAfter >= 0;

  return (
    <div className="nx-ld">
      <div className="nx-lv-crumb">
        <Link to="/leave">Quản lý nghỉ phép</Link>
        <span>›</span>
        <span>Chi tiết &amp; phê duyệt</span>
      </div>

      <div className="nx-ld-top">
        <div>
          <h1 className="nx-ld-title">
            Chi Tiết &amp; Thẩm Định Phê Duyệt
            <span className="nx-lv-code"> #{detail.leaveCode}</span>
          </h1>
          <div className="nx-ld-badges">
            <span className={`nx-lv-st ${detail.status}`}>{ST[detail.status] || detail.status}</span>
            {detail.urgency === 'URGENT' && <span className="nx-lv-urgent-tag">KHẨN CẤP</span>}
          </div>
        </div>
        <div className="nx-ld-top-links">
          <Link to="/leave" className="nx-btn-outline">
            ← Danh sách đơn
          </Link>
          <button
            type="button"
            className="nx-btn-outline"
            onClick={() => auditRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Lịch sử
          </button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <section className="nx-ld-card nx-ld-emp-card">
        <div className="nx-lv-emp">
          <div className="nx-lv-avatar lg">{initials(detail.employee?.fullName || '?')}</div>
          <div>
            <strong className="nx-lv-emp-name">{detail.employee?.fullName}</strong>
            <span className="nx-lv-sub">
              {detail.employee?.employeeCode} · {detail.employee?.position || '—'} ·{' '}
              {detail.department?.name || '—'}
            </span>
            {detail.employee?.email && <span className="nx-lv-sub">{detail.employee.email}</span>}
          </div>
        </div>
        <div className="nx-lc-quota-cards compact">
          <div className="nx-lc-qcard">
            <span>Định mức</span>
            <strong>{detail.quota.annualQuota}</strong>
          </div>
          <div className="nx-lc-qcard">
            <span>Đã dùng</span>
            <strong>{detail.quota.used}</strong>
          </div>
          <div className="nx-lc-qcard">
            <span>Đơn này</span>
            <strong>{detail.quota.thisRequest}</strong>
          </div>
          <div className="nx-lc-qcard highlight">
            <span>Còn sau đợt</span>
            <strong>{detail.quota.remainingAfter}</strong>
          </div>
        </div>
        <div className={`nx-lc-eligibility${eligible ? ' ok' : ' bad'}`}>
          {eligible ? 'ĐỦ ĐIỀU KIỆN PHÊ DUYỆT' : 'VƯỢT QUỸ PHÉP NĂM'}
        </div>
      </section>

      <div className="nx-ld-layout">
        <div>
          <section className="nx-ld-card">
            <h2>Nội dung đơn nghỉ</h2>
            <div className="nx-ld-meta">
              <div>
                <span>Loại phép</span>
                <span className={`nx-lv-type ${detail.leaveType}`}>
                  {TYPE[detail.leaveType] || detail.leaveType}
                </span>
              </div>
              <div>
                <span>Thời gian nghỉ</span>
                <strong>
                  {fmt(detail.startDate)} → {fmt(detail.endDate)} ({detail.daysCount} ngày làm việc)
                </strong>
              </div>
              <div>
                <span>Lý do</span>
                <p className="nx-ld-reason">{detail.reason || '—'}</p>
              </div>
              <div>
                <span>Người bàn giao</span>
                <strong>
                  {detail.handover?.fullName || '—'}
                  {detail.handover?.position ? ` · ${detail.handover.position}` : ''}
                </strong>
              </div>
              <div>
                <span>Chứng từ</span>
                <strong>{detail.attachmentName || 'Không yêu cầu'}</strong>
              </div>
            </div>
          </section>

          <section className="nx-ld-card" ref={auditRef}>
            <h2>Nhật ký &amp; lịch sử</h2>
            <ul className="nx-ld-timeline">
              {detail.audit.length === 0 && (
                <li className="nx-ld-timeline-item muted">Chưa có sự kiện</li>
              )}
              {detail.audit.map((a) => (
                <li key={a.id} className="nx-ld-timeline-item">
                  <i className="dot" />
                  <div>
                    <strong>{auditLabel(a.action)}</strong>
                    <div className="nx-lv-sub">
                      {a.actorUsername} · {fmt(a.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {detail.reviewerName && (
              <div className="nx-ld-reviewed">
                Quyết định bởi <strong>{detail.reviewerName}</strong> · {fmt(detail.reviewedAt)}
                {detail.reviewComment && (
                  <blockquote className="nx-ld-review-quote">{detail.reviewComment}</blockquote>
                )}
              </div>
            )}
          </section>
        </div>

        <aside>
          {canReview && detail.status === 'PENDING' && (
            <section className="nx-ld-card nx-ld-review-card">
              <h3>Thẩm định phê duyệt</h3>
              <div className="nx-ld-capacity">
                <strong>Ảnh hưởng nhân sự hôm nay</strong>
                <p>
                  {stats != null ? (
                    <>
                      Có <strong>{stats.onLeaveToday}</strong> nhân viên đang nghỉ phép ({stats.today}).
                      Kiểm tra phạm vi phòng ban trước khi duyệt.
                    </>
                  ) : (
                    <>Kiểm tra phạm vi phòng ban và năng lực thay thế trước khi quyết định.</>
                  )}
                </p>
              </div>
              <div className="nx-lc-field">
                <label>Nhận xét phê duyệt</label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ghi chú cho nhân viên (tuỳ chọn)…"
                />
              </div>
              <div className="nx-ld-review-btns">
                <button
                  type="button"
                  className="nx-ld-btn reject"
                  disabled={saving}
                  onClick={() => void review('REJECTED')}
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  className="nx-btn-primary"
                  disabled={saving}
                  onClick={() => void review('APPROVED')}
                >
                  Chấp thuận
                </button>
              </div>
            </section>
          )}

          {(!canReview || detail.status !== 'PENDING') && (
            <section className="nx-ld-card">
              <h3>Trạng thái xử lý</h3>
              <p className="nx-lv-sub">
                {detail.status === 'PENDING'
                  ? 'Đơn đang chờ quản lý phê duyệt.'
                  : detail.status === 'APPROVED'
                    ? 'Đơn đã được chấp thuận.'
                    : 'Đơn đã bị từ chối.'}
              </p>
            </section>
          )}
        </aside>
      </div>

      <div className="nx-ld-foot">
        <button type="button" className="ghost" onClick={() => navigate('/leave')}>
          Quay lại danh sách
        </button>
        <div className="spacer" />
      </div>
    </div>
  );
}
