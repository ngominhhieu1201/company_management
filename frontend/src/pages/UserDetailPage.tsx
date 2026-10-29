import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import '../styles/user-detail.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  email: string;
  phone: string;
  position: string;
  hireDate: string | null;
  departmentName: string | null;
};

type Detail = {
  id: number;
  uid: string;
  username: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  status: 'ACTIVE' | 'LOCKED';
  employeeId: number | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  online: boolean;
  workEmail: string | null;
  employee: Emp | null;
  permissions: string[];
  activity: {
    attendanceHours: number;
    taskTotal: number;
    taskInProgress: number;
  };
  session: {
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    online: boolean;
    twoFactorEnabled: boolean;
  };
};

type AuditRow = {
  id: number;
  createdAt: string;
  action: string;
  actorUsername: string;
  metadata: Record<string, unknown> | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, day] = iso.slice(0, 10).split('-');
      return `${day}/${m}/${y}`;
    }
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    LOGIN: 'ĐĂNG NHẬP',
    USER_CREATE: 'KHỞI TẠO',
    USER_UPDATE: 'CẬP NHẬT',
    USER_ROLE_CHANGE: 'ĐỔI VAI TRÒ',
    USER_STATUS_CHANGE: 'ĐỔI TRẠNG THÁI',
    USER_RESET_PASSWORD: 'ĐẶT LẠI MẬT KHẨU',
  };
  return map[action] || action;
}

function roleDesc(role: string) {
  if (role === 'ADMIN')
    return 'Toàn quyền quản trị HR, phòng ban, tài khoản và cấu hình.';
  if (role === 'MANAGER')
    return 'Quản lý team, duyệt nghỉ phép, giao việc trong phạm vi phòng ban.';
  return 'Chấm công, nhận việc và gửi đơn nghỉ phép tiêu chuẩn.';
}

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'EMPLOYEE'>('EMPLOYEE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tempPass, setTempPass] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.get(`/users/${id}`),
        api.get(`/users/${id}/audit`, { params: { limit: 40 } }),
      ]);
      setDetail(d.data);
      setRole(d.data.role);
      setAudit(a.data);
      setError('');
    } catch {
      setError('Không tải được chi tiết tài khoản');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = detail?.employee?.fullName || detail?.username || '';
  const roleDirty = detail != null && role !== detail.role;

  const permissions = useMemo(() => {
    if (!detail) return [];
    if (role === detail.role) return detail.permissions;
    if (role === 'ADMIN') {
      return [
        'Quản trị hệ thống (toàn quyền module)',
        'Quản lý & kích hoạt/khóa tài khoản',
        'Quản lý nhân sự toàn công ty',
        'Quản lý phòng ban',
        'Quản lý công việc / chấm công / nghỉ phép',
        'Xem nhật ký hệ thống (audit)',
      ];
    }
    if (role === 'MANAGER') {
      return [
        'Xem dashboard theo vai trò',
        'Chấm công cá nhân',
        'Gửi / theo dõi đơn nghỉ phép',
        'Xem & cập nhật công việc được giao',
        'Xem nhân sự trong phạm vi phòng ban',
        'Giao / theo dõi công việc team',
        'Duyệt nghỉ phép trong phạm vi quản lý',
        'Xem chấm công nhân viên thuộc phạm vi',
      ];
    }
    return [
      'Xem dashboard theo vai trò',
      'Chấm công cá nhân',
      'Gửi / theo dõi đơn nghỉ phép',
      'Xem & cập nhật công việc được giao',
    ];
  }, [detail, role]);

  async function saveRole() {
    if (!detail) return;
    if (!roleDirty) {
      setOkMsg('Vai trò không thay đổi');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Nhập lý do điều chỉnh quyền (≥ 3 ký tự) — bắt buộc khi đổi role');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${detail.id}`, { role, reason: reason.trim() });
      setReason('');
      setOkMsg('Đã lưu thay đổi vai trò');
      await load();
    } catch {
      setError('Lưu vai trò thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (roleDirty) {
      await saveRole();
      return;
    }
    setOkMsg('Không có thay đổi cần lưu');
  }

  async function toggleLock() {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/users/${detail.id}`, {
        status: detail.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE',
        reason:
          detail.status === 'ACTIVE'
            ? 'Khóa tài khoản từ màn chi tiết'
            : 'Mở khóa tài khoản từ màn chi tiết',
      });
      setOkMsg(
        detail.status === 'ACTIVE' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
      );
      await load();
    } catch {
      setError('Cập nhật trạng thái thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!detail) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/users/${detail.id}/reset-password`);
      setTempPass(data.temporaryPassword);
      setOkMsg('Đã tạo mật khẩu tạm — hãy sao chép ngay');
      await load();
    } catch {
      setError('Đặt lại mật khẩu thất bại');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!detail) {
    return (
      <Alert variant="danger">
        {error || 'Không tìm thấy tài khoản'}{' '}
        <Link to="/users">Quay lại</Link>
      </Alert>
    );
  }

  return (
    <div className="nx-ud">
      <nav className="nx-ud-crumb">
        <Link to="/users">Danh sách tài khoản</Link>
        <span className="sep">›</span>
        <span>Quản trị hệ thống</span>
        <span className="sep">›</span>
        <Link to="/users">Quản lý tài khoản</Link>
        <span className="sep">›</span>
        <span className="here">
          Chi tiết: {detail.username}
          {detail.employee ? ` (${detail.employee.fullName})` : ''}
        </span>
      </nav>

      <h1 className="nx-ud-title">Chi tiết &amp; Cập Nhật Tài Khoản</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {okMsg && (
        <Alert variant="success" dismissible onClose={() => setOkMsg('')}>
          {okMsg}
        </Alert>
      )}

      <div className="nx-ud-grid">
        <aside>
          <div className="nx-ud-card nx-ud-profile">
            <div className="nx-ud-avatar-wrap">
              <div className="nx-ud-avatar">{initials(displayName)}</div>
              <span
                className={`nx-ud-status-dot ${detail.status === 'ACTIVE' ? 'on' : 'off'}`}
              >
                {detail.status}
              </span>
            </div>
            <h2>{displayName}</h2>
            <p className="pos">{detail.employee?.position || '—'}</p>
            <div className="nx-ud-handles">
              <span>@{detail.username}</span>
              <span>{detail.employee?.employeeCode || detail.uid}</span>
            </div>

            <div className="nx-ud-info">
              <div>
                <span>Phòng ban</span>
                <strong>{detail.employee?.departmentName || '—'}</strong>
              </div>
              <div>
                <span>Email công việc</span>
                <strong>{detail.workEmail || '—'}</strong>
              </div>
              <div>
                <span>Số điện thoại</span>
                <strong>{detail.employee?.phone || '—'}</strong>
              </div>
              <div>
                <span>Ngày vào làm</span>
                <strong>{fmtDate(detail.employee?.hireDate)}</strong>
              </div>
            </div>

            <div className="nx-ud-acc-state">
              <strong>
                {detail.status === 'ACTIVE'
                  ? 'Đang hoạt động (ACTIVE)'
                  : 'Đã khóa (LOCKED)'}
              </strong>
              <span className="text-muted">
                {detail.status === 'ACTIVE'
                  ? 'Không hạn chế đăng nhập'
                  : 'Không thể đăng nhập cho đến khi mở khóa'}
              </span>
            </div>

            <div className="nx-ud-actions">
              <button
                type="button"
                className="nx-ud-btn-blue"
                disabled={saving}
                onClick={() => void resetPassword()}
              >
                Đặt lại mật khẩu tạm thời
              </button>
              <button
                type="button"
                className={
                  detail.status === 'ACTIVE' ? 'nx-ud-btn-danger' : 'nx-ud-btn-ok'
                }
                disabled={saving}
                onClick={() => void toggleLock()}
              >
                {detail.status === 'ACTIVE'
                  ? 'Khóa tài khoản (LOCK)'
                  : 'Mở khóa tài khoản'}
              </button>
            </div>
          </div>

          <div className="nx-ud-card nx-ud-stats">
            <h3>Thống kê hoạt động gần nhất</h3>
            <div className="nx-ud-stat-row">
              <div className="nx-ud-stat">
                <span>Giờ chấm công</span>
                <strong>{detail.activity.attendanceHours}</strong>
              </div>
              <div className="nx-ud-stat">
                <span>Công việc</span>
                <strong>
                  {detail.activity.taskTotal}
                  <small style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    {' '}
                    ({detail.activity.taskInProgress} đang làm)
                  </small>
                </strong>
              </div>
            </div>
          </div>
        </aside>

        <div className="nx-ud-main">
          <section className="nx-ud-card">
            <h3>Cập nhật Vai trò &amp; Quyền hạn (RBAC)</h3>
            <div className="nx-ud-roles">
              {(['ADMIN', 'MANAGER', 'EMPLOYEE'] as const).map((r) => (
                <label
                  key={r}
                  className={`nx-ud-role ${role === r ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={role === r}
                    onChange={() => setRole(r)}
                  />
                  <strong>{r}</strong>
                  <p>{roleDesc(r)}</p>
                </label>
              ))}
            </div>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>
              Phạm vi quyền hạn áp dụng thực tế
            </p>
            <ul className="nx-ud-perms">
              {permissions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="nx-ud-reason">
              <label htmlFor="reason">
                Lý do điều chỉnh quyền {roleDirty ? '(bắt buộc)' : ''}
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ghi rõ lý do để lưu audit trail (vd: thăng chức / điều chuyển)…"
              />
            </div>
            <div style={{ marginTop: '0.85rem' }}>
              <button
                type="button"
                className="nx-btn-primary"
                disabled={saving || !roleDirty}
                onClick={() => void saveRole()}
              >
                Lưu thay đổi vai trò
              </button>
            </div>
          </section>

          <section className="nx-ud-card">
            <h3>Trạng thái phiên đăng nhập</h3>
            <div className="nx-ud-session-meta">
              <span className="nx-ud-badge off">
                2FA: {detail.session.twoFactorEnabled ? 'ĐÃ BẬT' : 'CHƯA HỖ TRỢ'}
              </span>
              {detail.session.online && (
                <span className="nx-ud-badge on">ĐANG TRỰC TUYẾN</span>
              )}
            </div>
            <div className="nx-ud-session-row">
              <div>
                <strong>Phiên / đăng nhập gần nhất (từ DB)</strong>
                <span>
                  {detail.session.lastLoginAt
                    ? fmtDate(detail.session.lastLoginAt)
                    : 'Chưa từng đăng nhập'}
                  {detail.session.lastLoginIp
                    ? ` · IP ${detail.session.lastLoginIp}`
                    : ''}
                </span>
              </div>
              <span className={`nx-ud-badge ${detail.session.online ? 'on' : 'off'}`}>
                {detail.session.online ? 'ĐANG KẾT NỐI' : 'NGOẠI TUYẾN'}
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
              Hệ thống dùng JWT cookie — chưa lưu danh sách đa thiết bị. Không
              hiển thị session giả.
            </p>
          </section>

          <section className="nx-ud-card">
            <h3>Lịch sử thay đổi tài khoản (Audit Trail)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="nx-ud-audit">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Sự kiện</th>
                    <th>Thực hiện bởi</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        Chưa có nhật ký cho tài khoản này.
                      </td>
                    </tr>
                  )}
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDate(row.createdAt)}</td>
                      <td>
                        <strong>{actionLabel(row.action)}</strong>
                      </td>
                      <td>{row.actorUsername}</td>
                      <td>
                        {row.metadata
                          ? Object.entries(row.metadata)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className="nx-ud-foot">
        <Link to="/users" className="nx-btn-outline">
          Quay lại danh sách tài khoản
        </Link>
        <div className="spacer" />
        <button
          type="button"
          className="nx-btn-outline"
          onClick={() => {
            setRole(detail.role);
            setReason('');
            navigate('/users');
          }}
        >
          Hủy thao tác
        </button>
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving}
          onClick={() => void saveAll()}
        >
          Lưu tất cả thay đổi
        </button>
      </div>

      <Modal show={!!tempPass} onHide={() => setTempPass(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Mật khẩu tạm thời</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Sao chép ngay — hệ thống không hiển thị lại mật khẩu này.</p>
          <code
            style={{
              display: 'block',
              padding: '0.75rem',
              background: '#f4f7f6',
              borderRadius: 8,
              fontSize: '1rem',
            }}
          >
            {tempPass}
          </code>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="nx-btn-outline"
            onClick={async () => {
              if (tempPass) await navigator.clipboard.writeText(tempPass);
              setTempPass(null);
            }}
          >
            Sao chép &amp; đóng
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
