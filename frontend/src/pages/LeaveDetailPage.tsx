import { useCallback, useEffect, useState } from 'react';
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

const TYPE: Record<string, string> = {
  ANNUAL: 'PHÉP NĂM',
  SICK: 'ỐM ĐAU BHXH',
  UNPAID: 'KHÔNG LƯƠNG',
  OTHER: 'VIỆC RIÊNG',
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

export default function LeaveDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get<Detail>(`/leave/${id}`);
      setDetail(data);
      setComment(data.reviewComment || '');
      setError('');
    } catch {
      setError('Không tải được đơn');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/leave/${detail.id}/review`, { decision, comment: comment.trim() || undefined });
      setOk(decision === 'APPROVED' ? 'Đã phê duyệt' : 'Đã từ chối');
      await load();
    } catch {
      setError('Phê duyệt thất bại');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>;
  if (!detail) {
    return (
      <div>
        <Alert variant="danger">{error || 'Không tìm thấy'}</Alert>
        <Link to="/leave">← Quay lại</Link>
      </div>
    );
  }

  return (
    <div className="nx-ld">
      <div className="nx-lv-crumb">
        <Link to="/leave">Quay lại danh sách</Link><span>›</span><span>Chi tiết đơn</span>
      </div>
      <div className="nx-lv-head">
        <div>
          <h1>Chi Tiết Đơn Nghỉ Phép & Thẩm Định Phê Duyệt</h1>
          <div className="nx-ld-badges">
            <span className={`nx-lv-st ${detail.status}`}>{detail.status}</span>
            <span className={`nx-lv-type ${detail.leaveType}`}>{TYPE[detail.leaveType]}</span>
            {detail.urgency === 'URGENT' && (
              <span className="nx-lv-st REJECTED">KHẨN CẤP / 24H</span>
            )}
            <span className="nx-lv-code">#{detail.leaveCode}</span>
          </div>
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <div className="nx-ld-layout">
        <div>
          <section className="nx-ld-card">
            <h2>Thông tin nhân sự & quỹ phép</h2>
            <div className="nx-ld-meta">
              <div><span>Họ tên</span><strong>{detail.employee?.fullName}</strong></div>
              <div><span>Mã NV / Chức danh</span>{detail.employee?.employeeCode} · {detail.employee?.position || '—'}</div>
              <div><span>Phòng ban</span>{detail.department?.name || '—'}</div>
              <div><span>Email</span>{detail.employee?.email || '—'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
              <div className="nx-lc-summary" style={{ background: '#f7faf8', color: 'inherit' }}>
                <div style={{ fontSize: '.7rem', color: '#7a8a85' }}>Định mức</div>
                <strong>{detail.quota.annualQuota}</strong>
              </div>
              <div className="nx-lc-summary" style={{ background: '#f7faf8', color: 'inherit' }}>
                <div style={{ fontSize: '.7rem', color: '#7a8a85' }}>Đã dùng</div>
                <strong>{detail.quota.used}</strong>
              </div>
              <div className="nx-lc-summary">
                <div style={{ fontSize: '.7rem' }}>Đơn này</div>
                <strong>{detail.quota.thisRequest} ngày</strong>
              </div>
              <div className="nx-lc-summary" style={{ background: '#e8f1fb', color: '#1565c0' }}>
                <div style={{ fontSize: '.7rem' }}>Còn sau đợt</div>
                <strong>{detail.quota.remainingAfter}</strong>
              </div>
            </div>
          </section>

          <section className="nx-ld-card">
            <h2>Thời gian & kế hoạch bàn giao</h2>
            <div className="nx-ld-meta">
              <div><span>Thời gian</span>{fmt(detail.startDate)} → {fmt(detail.endDate)} ({detail.daysCount} ngày)</div>
              <div><span>Lý do</span>{detail.reason || '—'}</div>
              <div><span>Người bàn giao</span>{detail.handover?.fullName || '—'}{detail.handover?.position ? ` · ${detail.handover.position}` : ''}</div>
              {detail.attachmentName && <div><span>Chứng từ</span>{detail.attachmentName}</div>}
            </div>
          </section>
        </div>

        <aside>
          {canReview && detail.status === 'PENDING' && (
            <section className="nx-ld-card">
              <h3>Thẩm quyền quyết định</h3>
              <div className="nx-lc-field">
                <label>Nhận xét phê duyệt</label>
                <textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button type="button" className="nx-btn-primary" style={{ width: '100%', marginBottom: 8 }} disabled={saving} onClick={() => void review('APPROVED')}>
                Chấp thuận & phê duyệt
              </button>
              <button type="button" className="nx-btn-outline" style={{ width: '100%', color: '#c62828', borderColor: '#f5c6c6' }} disabled={saving} onClick={() => void review('REJECTED')}>
                Từ chối đơn
              </button>
            </section>
          )}

          <section className="nx-ld-card">
            <h3>Quy trình duyệt</h3>
            <ul className="nx-ld-flow">
              <li className="on"><i className="dot" />Nhân viên gửi đơn</li>
              <li className={detail.handover ? 'on' : ''}><i className="dot" />Bàn giao{detail.handover ? ' (đã gán)' : ''}</li>
              <li className={detail.status !== 'PENDING' ? 'on' : ''}><i className="dot" />Quản lý / Admin {detail.status === 'PENDING' ? '(chờ)' : detail.status}</li>
              <li className={detail.status === 'APPROVED' ? 'on' : ''}><i className="dot" />Hoàn tất</li>
            </ul>
            {detail.reviewerName && (
              <div style={{ fontSize: '.8rem', color: '#7a8a85', marginTop: 8 }}>
                Duyệt bởi {detail.reviewerName} · {fmt(detail.reviewedAt)}
              </div>
            )}
          </section>

          <section className="nx-ld-card">
            <h3>Nhật ký</h3>
            <ul className="nx-ld-audit">
              {detail.audit.map((a) => (
                <li key={a.id}>
                  <strong>{a.action}</strong>
                  <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>{a.actorUsername} · {fmt(a.createdAt)}</div>
                </li>
              ))}
              {detail.audit.length === 0 && <li style={{ color: '#7a8a85' }}>Chưa có</li>}
            </ul>
          </section>
        </aside>
      </div>

      <div className="nx-ld-foot">
        <button type="button" className="ghost" onClick={() => navigate('/leave')}>Danh sách đơn</button>
        <div className="spacer" />
      </div>
    </div>
  );
}
