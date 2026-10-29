import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import EmployeePersonalProfilePage from './EmployeePersonalProfilePage';
import '../styles/account.css';

type Profile = {
  id: number;
  uid: string;
  username: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  managedHeadcount: number | null;
  employee: {
    fullName: string;
    employeeCode: string;
    email: string;
    phone: string;
    position: string;
    departmentName: string | null;
  } | null;
};

function roleLabel(role: string) {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'MANAGER') return 'Quản lý';
  return 'Nhân viên';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AccountSecurityPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Profile>('/auth/profile');
      setProfile(data);
      setError('');
    } catch {
      setError('Không tải được thông tin tài khoản');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Mật khẩu mới tối thiểu 8 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOkMsg('Đã đổi mật khẩu thành công');
      setError('');
    } catch {
      setError('Đổi mật khẩu thất bại — kiểm tra mật khẩu hiện tại');
    } finally {
      setSaving(false);
    }
  }

  async function logoutOthers() {
    setOkMsg(
      'Hệ thống dùng JWT cookie — chỉ có phiên trình duyệt hiện tại. Đăng xuất để kết thúc phiên này.',
    );
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  const displayName =
    profile?.employee?.fullName || profile?.username || user?.username || '';

  return (
    <div className="nx-account">
      <div className="nx-account-head">
        <div>
          <h1>Tài khoản &amp; Bảo mật</h1>
          <p>Thông tin cá nhân, đổi mật khẩu và quản lý phiên đăng nhập.</p>
        </div>
      </div>

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

      {profile && (
        <div className="nx-account-grid">
          <section className="nx-account-card nx-account-hero">
            <div className="nx-account-avatar">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2>{displayName}</h2>
              <div className="nx-account-badges">
                <span className={`role ${profile.role.toLowerCase()}`}>
                  {roleLabel(profile.role)}
                </span>
                <span
                  className={`status ${profile.status === 'ACTIVE' ? 'on' : 'off'}`}
                >
                  {profile.status}
                </span>
              </div>
              <p className="handle">@{profile.username} · {profile.uid}</p>
            </div>
            {profile.role === 'MANAGER' && profile.managedHeadcount != null && (
              <div className="nx-account-scope">
                <span>Phạm vi HR</span>
                <strong>{profile.managedHeadcount}</strong>
                <small>nhân sự thuộc phòng ban quản lý</small>
              </div>
            )}
          </section>

          <section className="nx-account-card">
            <h3>Thông tin nhân sự liên kết</h3>
            {profile.employee ? (
              <dl className="nx-account-dl">
                <div>
                  <dt>Mã nhân viên</dt>
                  <dd>{profile.employee.employeeCode}</dd>
                </div>
                <div>
                  <dt>Chức danh</dt>
                  <dd>{profile.employee.position || '—'}</dd>
                </div>
                <div>
                  <dt>Phòng ban</dt>
                  <dd>{profile.employee.departmentName || '—'}</dd>
                </div>
                <div>
                  <dt>Email công việc</dt>
                  <dd>{profile.employee.email || '—'}</dd>
                </div>
                <div>
                  <dt>Điện thoại</dt>
                  <dd>{profile.employee.phone || '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted">Tài khoản chưa liên kết hồ sơ nhân sự.</p>
            )}
          </section>

          <section className="nx-account-card">
            <h3>Đổi mật khẩu</h3>
            <form className="nx-account-pw-form" onSubmit={(e) => void submitPassword(e)}>
              <label>
                Mật khẩu hiện tại
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                Mật khẩu mới (≥ 8 ký tự)
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
              <label>
                Xác nhận mật khẩu mới
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
              <button type="submit" className="nx-btn-primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Cập nhật mật khẩu'}
              </button>
            </form>
          </section>

          <section className="nx-account-card">
            <h3>Phiên đăng nhập</h3>
            <p className="nx-account-note">
              Hệ thống lưu lần đăng nhập gần nhất — chưa theo dõi đa thiết bị chi tiết.
            </p>
            <div className="nx-session-card current">
              <div>
                <strong>Thiết bị này</strong>
                <span>
                  {profile.lastLoginAt
                    ? fmtDate(profile.lastLoginAt)
                    : 'Phiên hiện tại'}
                  {profile.lastLoginIp ? ` · IP ${profile.lastLoginIp}` : ''}
                </span>
              </div>
              <span className="pill on">ĐANG DÙNG</span>
            </div>
            <div className="nx-session-actions">
              <button
                type="button"
                className="nx-btn-outline"
                onClick={() => void logoutOthers()}
              >
                Đăng xuất thiết bị khác
              </button>
              <button
                type="button"
                className="nx-btn-outline danger"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
              >
                Đăng xuất phiên này
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function AccountProfilePage() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') {
    return <EmployeePersonalProfilePage />;
  }
  return <AccountSecurityPage />;
}
