import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
function fmtDur(mins: number | null) {
  if (mins == null) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AttendanceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
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
    if (!detail || !canManage) return;
    try {
      await api.patch(`/attendance/${detail.id}/flag`, { flagged: !detail.flagged });
      await load();
    } catch {
      setError('Gắn cờ thất bại');
    }
  }

  if (loading) return <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>;
  if (!detail) {
    return (
      <div>
        <Alert variant="danger">{error || 'Không tìm thấy'}</Alert>
        <Link to="/attendance">← Quay lại</Link>
      </div>
    );
  }

  const photoKey = detail.checkInPhotoKey || detail.checkOutPhotoKey;
  const photoUrl = photoKey ? `${apiBase}/attendance/photo/${photoKey}` : null;

  return (
    <div>
      <div className="nx-att-crumb">
        <Link to="/attendance">Quay lại AD-15</Link>
        <span>›</span>
        <span>Chi tiết bản ghi chấm công</span>
      </div>
      <div className="nx-att-head">
        <h1>Chi Tiết Bản Ghi & Ảnh Camera Xác Nhận</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="nx-btn-outline" onClick={() => navigate('/attendance')}>
            Quay lại danh sách
          </button>
          {canManage && (
            <button type="button" className="nx-btn-outline" style={{ color: '#c62828', borderColor: '#f5c6c6' }} onClick={() => void toggleFlag()}>
              {detail.flagged ? 'Bỏ gắn cờ' : 'Gắn cờ kiểm tra'}
            </button>
          )}
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="nx-ad-card">
        <div className="nx-ad-hero">
          <div className="av">{initials(detail.employee?.fullName || '?')}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="nx-att-st on">ĐÃ XÁC THỰC CAMERA</span>
              <span className="nx-att-code">#{detail.recordCode}</span>
              {detail.flagged && <span className="nx-att-st late">CẦN ĐỐI SOÁT</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{detail.employee?.fullName}</h2>
            <div style={{ fontSize: '.85rem', color: '#7a8a85' }}>
              {detail.employee?.employeeCode} · {detail.employee?.position || '—'} · {detail.department?.name || '—'}
              <br />
              {detail.shiftLabel} ({detail.shiftStart} – {detail.shiftEnd})
            </div>
          </div>
        </div>
        <div className="nx-ad-metrics">
          <div className="nx-ad-metric"><span>Ngày chấm công</span><strong>{fmtDate(detail.workDate)}</strong></div>
          <div className="nx-ad-metric">
            <span>Giờ vào</span>
            <strong className={detail.punctuality === 'LATE' ? 'nx-att-time warn' : 'nx-att-time ok'}>
              {timeOnly(detail.checkInTime)}
            </strong>
            <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>
              {detail.punctuality === 'LATE' && detail.lateMinutes != null
                ? `Trễ ${detail.lateMinutes} phút`
                : detail.earlyMinutes != null
                  ? `Sớm ${detail.earlyMinutes} phút`
                  : 'Đúng giờ'}
            </div>
          </div>
          <div className="nx-ad-metric">
            <span>Giờ ra</span>
            <strong>{detail.status === 'IN_PROGRESS' ? 'Đang trong ca' : timeOnly(detail.checkOutTime)}</strong>
            <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>{fmtDur(detail.workMinutes)}</div>
          </div>
          <div className="nx-ad-metric">
            <span>Quy đổi công</span>
            <strong className="nx-att-time ok">{detail.workUnits != null ? `${detail.workUnits} Công` : '—'}</strong>
          </div>
        </div>
      </div>

      <div className="nx-ad-layout">
        <div>
          <section className="nx-ad-card">
            <h3 style={{ marginTop: 0 }}>Ảnh chụp camera lúc vào ca</h3>
            <div className="nx-ad-photo">
              {photoUrl ? (
                <img src={photoUrl} alt="check-in" />
              ) : (
                <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>Không có ảnh</div>
              )}
              {photoUrl && <div className="tag">ẢNH XÁC THỰC HỢP LỆ</div>}
            </div>
            <div className="nx-ad-tech">
              <div><span>Chất lượng</span>Ảnh camera thiết bị</div>
              <div><span>Nguồn</span>Camera trước · Check-in</div>
              <div><span>Trạng thái</span>Đã lưu trên máy chủ</div>
            </div>
          </section>
        </div>
        <aside>
          <section className="nx-ad-card">
            <h3 style={{ marginTop: 0 }}>Thời gian ghi nhận</h3>
            <div className="nx-ad-server">
              <div style={{ fontSize: '.72rem', opacity: .8 }}>Server timestamp</div>
              <strong>{detail.checkInTime ? new Date(detail.checkInTime).toISOString().replace('T', ' ').slice(0, 23) : '—'}</strong>
            </div>
          </section>
          <section className="nx-ad-card">
            <h3 style={{ marginTop: 0 }}>5 ca gần nhất</h3>
            <table className="nx-ad-hist">
              <thead>
                <tr><th>Ngày</th><th>Vào</th><th>Ra</th><th>Ảnh</th></tr>
              </thead>
              <tbody>
                {detail.recentHistory.map((h) => (
                  <tr key={h.id}>
                    <td><Link to={`/attendance/${h.id}`}>{fmtDate(h.workDate)}</Link></td>
                    <td>{timeOnly(h.checkInTime)}</td>
                    <td>{timeOnly(h.checkOutTime)}</td>
                    <td>{h.checkInPhotoKey ? '✓' : '—'}</td>
                  </tr>
                ))}
                {detail.recentHistory.length === 0 && (
                  <tr><td colSpan={4} style={{ color: '#7a8a85' }}>Chưa có</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  );
}
