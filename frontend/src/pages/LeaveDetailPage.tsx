import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  ST_EMP,
  TYPE_LABEL,
  fmtDate,
  fmtDays,
  initials,
  parseStoredReason,
  slaHint,
  weekdayVi,
} from './leaveEmployeeUtils';
import '../styles/leave.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
  attachmentKey?: string | null;
  reviewComment: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  employee: {
    id: number;
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

const TYPE_MGR: Record<string, string> = {
  ANNUAL: 'Phép năm (AL)',
  SICK: 'Ốm đau BHXH',
  UNPAID: 'Không lương',
  OTHER: 'Việc riêng',
};

const ST: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime()) && String(iso).includes('T')) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return fmtDate(String(iso));
}

function auditLabel(action: string) {
  if (action === 'LEAVE_CREATE') return 'Tạo đơn nghỉ phép';
  if (action === 'LEAVE_APPROVED') return 'Phê duyệt đơn';
  if (action === 'LEAVE_REJECTED') return 'Từ chối đơn';
  if (action === 'LEAVE_CANCELLED') return 'Hủy đơn nghỉ phép';
  return action;
}

function EmployeeLeaveDetailView({
  detail,
  managerName,
  onCancel,
  cancelBusy,
  note,
  setNote,
}: {
  detail: Detail;
  managerName: string | null;
  onCancel: () => void;
  cancelBusy: boolean;
  note: string;
  setNote: (v: string) => void;
}) {
  const parsed = parseStoredReason(detail.reason);
  const usedPct =
    detail.quota.annualQuota > 0
      ? Math.min(100, ((detail.quota.used + detail.quota.thisRequest) / detail.quota.annualQuota) * 100)
      : 0;
  const handoverStepClass = !detail.handover
    ? ''
    : detail.status !== 'PENDING'
      ? 'done'
      : 'next';

  return (
    <div className="nx-emp-lv-detail">
      <nav className="nx-emp-lv-detail-crumb" aria-label="Breadcrumb">
        <Link to="/leave">Quay lại danh sách đơn</Link>
        <span>›</span>
        <span>Quản trị cá nhân</span>
        <span>›</span>
        <span>Phân hệ Nghỉ phép</span>
        <span>›</span>
        <span className="current">Chi tiết đơn #{detail.leaveCode}</span>
      </nav>

      <header className="nx-emp-lv-detail-head">
        <div>
          <div className="nx-emp-lv-detail-meta-row">
            <span className="code">#{detail.leaveCode}</span>
            {detail.status === 'PENDING' && (
              <span className="nx-emp-lv-detail-sla">{slaHint(detail.createdAt, detail.urgency)}</span>
            )}
          </div>
          <h1>{TYPE_LABEL[detail.leaveType] || detail.leaveType}</h1>
          <p className="nx-emp-lv-detail-sub">
            {detail.employee?.fullName} · {detail.department?.name || '—'} · Gửi lúc{' '}
            {fmtDateTime(detail.createdAt)}
          </p>
        </div>
        <div className="nx-emp-lv-detail-head-right">
          <span className={`nx-emp-lv-detail-st ${detail.status}`}>
            {ST_EMP[detail.status] || detail.status}
          </span>
          <div className="nx-emp-lv-detail-pills">
            <span>
              <em>Thời lượng</em>
              <strong>{fmtDays(detail.daysCount)} Ngày</strong>
            </span>
            <span>
              <em>Hưởng lương</em>
              <strong>{detail.leaveType === 'UNPAID' ? '0%' : '100%'}</strong>
            </span>
          </div>
        </div>
      </header>

      <div className="nx-emp-lv-detail-layout">
        <div className="nx-emp-lv-detail-main">
          <section className="nx-emp-lv-detail-card">
            <h2>Thông tin chi tiết đơn nghỉ phép</h2>
            <div className="nx-emp-lv-detail-grid">
              <div>
                <span className="lbl">Loại &amp; thời gian</span>
                <strong>{TYPE_LABEL[detail.leaveType] || detail.leaveType}</strong>
                <span className="nx-lv-sub">
                  {weekdayVi(detail.startDate)}, {fmtDate(detail.startDate)}
                  {detail.startDate !== detail.endDate
                    ? ` – ${fmtDate(detail.endDate)}`
                    : ''}
                </span>
                <span className="nx-emp-lv-detail-format">{parsed.formatLabel}</span>
              </div>
              {detail.leaveType === 'ANNUAL' && (
                <div className="nx-emp-lv-detail-balance">
                  <span className="lbl">Ảnh hưởng quỹ phép</span>
                  <div className="nx-emp-lv-detail-balance-row">
                    <div>
                      <span>Khả dụng</span>
                      <strong>{fmtDays(detail.quota.remaining)}</strong>
                    </div>
                    <div>
                      <span>Thay đổi</span>
                      <strong className="neg">−{fmtDays(detail.quota.thisRequest)}</strong>
                    </div>
                    <div>
                      <span>Sau duyệt (dự kiến)</span>
                      <strong>{fmtDays(detail.quota.remainingAfter)}</strong>
                    </div>
                  </div>
                  <div className="nx-emp-lv-detail-bar">
                    <i style={{ width: `${usedPct}%` }} />
                  </div>
                  <span className="nx-lv-sub">
                    Đã dùng {fmtDays(detail.quota.used + (detail.status === 'APPROVED' ? detail.quota.thisRequest : 0))}/
                    {fmtDays(detail.quota.annualQuota)} ngày
                  </span>
                </div>
              )}
              <div className="full">
                <span className="lbl">Lý do xin nghỉ</span>
                <p className="nx-emp-lv-detail-reason">{parsed.mainReason || '—'}</p>
              </div>
            </div>
          </section>

          <section className="nx-emp-lv-detail-card">
            <h2>Kế hoạch bàn giao công việc</h2>
            {detail.handover ? (
              <div className="nx-emp-lv-detail-handover-person">
                <span className="nx-lv-avatar">{initials(detail.handover.fullName)}</span>
                <div>
                  <strong>{detail.handover.fullName}</strong>
                  <span className="nx-lv-sub">{detail.handover.position || 'Đồng nghiệp'}</span>
                  <span className="nx-emp-lv-detail-handover-st">
                    {detail.status === 'PENDING' ? 'Chờ xác nhận bàn giao' : 'Đã xác nhận bàn giao'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="nx-lv-muted">Không chỉ định người nhận bàn giao</p>
            )}
            {parsed.handoverPlan && (
              <p className="nx-emp-lv-detail-reason">{parsed.handoverPlan}</p>
            )}
            {detail.attachmentName && (
              <div className="nx-emp-lv-detail-file">
                <span className="icon" aria-hidden />
                <div>
                  {detail.attachmentKey ? (
                    <a
                      href={`${apiBase}/leave/files/${encodeURIComponent(detail.attachmentKey)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{detail.attachmentName}</strong>
                    </a>
                  ) : (
                    <strong>{detail.attachmentName}</strong>
                  )}
                  <span className="nx-lv-sub">Tệp đính kèm</span>
                </div>
              </div>
            )}
          </section>

          <section className="nx-emp-lv-detail-card">
            <h2>Trao đổi &amp; Ghi chú thẩm định</h2>
            <ul className="nx-emp-lv-detail-thread">
              {detail.audit.length === 0 && (
                <li className="muted">Chưa có trao đổi — hệ thống ghi nhận khi có cập nhật.</li>
              )}
              {detail.audit.map((a) => (
                <li key={a.id}>
                  <span className="nx-lv-avatar sm">{initials(a.actorUsername)}</span>
                  <div>
                    <strong>{auditLabel(a.action)}</strong>
                    <span className="nx-lv-sub">
                      {a.actorUsername} · {fmtDateTime(a.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
              {detail.reviewComment && (
                <li>
                  <span className="nx-lv-avatar sm">{initials(detail.reviewerName || 'QL')}</span>
                  <div>
                    <strong>Nhận xét quản lý</strong>
                    <p className="nx-emp-lv-detail-reason">{detail.reviewComment}</p>
                  </div>
                </li>
              )}
            </ul>
            {detail.status === 'PENDING' && (
              <div className="nx-emp-lv-detail-compose">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Gửi thêm ghi chú cho quản lý… (chỉ lưu cục bộ — chưa có API bình luận)"
                  disabled
                />
                <button type="button" className="nx-btn-outline" disabled title="Chưa có API bình luận">
                  Gửi phản hồi
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="nx-emp-lv-detail-rail">
          <section className="nx-emp-lv-detail-side">
            <h3>Tiến trình phê duyệt</h3>
            <ol className="nx-emp-lv-create-flow nx-emp-lv-detail-flow">
              <li className="done">
                <i />
                <div>
                  <strong>Nhân viên tạo đơn</strong>
                  <span>{detail.employee?.fullName}</span>
                </div>
              </li>
              <li className={handoverStepClass}>
                <i />
                <div>
                  <strong>Người nhận bàn giao</strong>
                  <span>{detail.handover?.fullName || '—'}</span>
                </div>
              </li>
              <li
                className={
                  detail.status === 'APPROVED'
                    ? 'done'
                    : detail.status === 'PENDING'
                      ? 'next'
                      : detail.status === 'REJECTED'
                        ? 'reject'
                        : ''
                }
              >
                <i />
                <div>
                  <strong>Quản lý phê duyệt</strong>
                  <span>
                    {detail.reviewerName || managerName || 'Quản lý trực tiếp'}
                    {detail.status === 'PENDING' && detail.urgency !== 'URGENT' && (
                      <em> SLA &lt; 4h</em>
                    )}
                  </span>
                </div>
              </li>
            </ol>
          </section>

          <section className="nx-emp-lv-detail-side">
            <h3>Tác vụ của bạn</h3>
            <div className="nx-emp-lv-detail-actions">
              {detail.status === 'PENDING' && (
                <Link to={`/leave/new`} className="nx-btn-outline block">
                  Tạo đơn mới
                </Link>
              )}
              <button type="button" className="nx-btn-outline block" disabled title="Sắp có">
                In đơn xin nghỉ phép (PDF)
              </button>
              {detail.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    className="nx-emp-lv-detail-cancel"
                    disabled={cancelBusy}
                    onClick={onCancel}
                  >
                    Hủy đơn nghỉ phép này
                  </button>
                  <p className="nx-emp-lv-detail-cancel-note">
                    {fmtDays(detail.quota.thisRequest)} ngày sẽ được hoàn lại quỹ phép khi hủy đơn đang chờ
                    duyệt.
                  </p>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function LeaveDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auditRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [employeeNote, setEmployeeNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
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

  useEffect(() => {
    if (user?.role !== 'EMPLOYEE' || !user.employeeId) return;
    api
      .get<{ managerName?: string | null }>(`/employees/${user.employeeId}`)
      .then((r) => setManagerName(r.data.managerName ?? null))
      .catch(() => undefined);
  }, [user?.role, user?.employeeId]);

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

  async function cancelOwn() {
    if (!detail) return;
    if (!window.confirm('Hủy đơn nghỉ phép đang chờ duyệt?')) return;
    setCancelBusy(true);
    try {
      await api.patch(`/leave/${detail.id}/cancel`);
      setOk('Đã hủy đơn nghỉ phép');
      await load();
    } catch {
      setError('Không hủy được đơn');
    } finally {
      setCancelBusy(false);
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

  const isOwnEmployee =
    user?.role === 'EMPLOYEE' &&
    user.employeeId != null &&
    detail.employee?.id === user.employeeId;

  if (isOwnEmployee) {
    return (
      <>
        {error && <Alert variant="danger">{error}</Alert>}
        {ok && <Alert variant="success">{ok}</Alert>}
        <EmployeeLeaveDetailView
          detail={detail}
          managerName={managerName}
          onCancel={() => void cancelOwn()}
          cancelBusy={cancelBusy}
          note={employeeNote}
          setNote={setEmployeeNote}
        />
      </>
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
                  {TYPE_MGR[detail.leaveType] || detail.leaveType}
                </span>
              </div>
              <div>
                <span>Thời gian nghỉ</span>
                <strong>
                  {fmtDateTime(detail.startDate)} → {fmtDateTime(detail.endDate)} ({detail.daysCount}{' '}
                  ngày làm việc)
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
                <strong>
                  {detail.attachmentName ? (
                    detail.attachmentKey ? (
                      <a
                        href={`${apiBase}/leave/files/${encodeURIComponent(detail.attachmentKey)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {detail.attachmentName}
                      </a>
                    ) : (
                      detail.attachmentName
                    )
                  ) : (
                    'Không yêu cầu'
                  )}
                </strong>
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
                      {a.actorUsername} · {fmtDateTime(a.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {detail.reviewerName && (
              <div className="nx-ld-reviewed">
                Quyết định bởi <strong>{detail.reviewerName}</strong> · {fmtDateTime(detail.reviewedAt)}
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
