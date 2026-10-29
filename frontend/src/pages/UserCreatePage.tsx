import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/user-create.css';

type EmpOpt = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  position: string;
  status: string;
  departmentId: number | null;
  departmentName: string | null;
};

type UsernameCheck = {
  available: boolean;
  reason: 'OK' | 'TAKEN' | 'TOO_SHORT' | 'INVALID';
};

const DRAFT_KEY = 'nexora-user-create-draft';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sanitizeUsername(raw: string) {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

function suggestFromEmployee(emp: EmpOpt): string[] {
  const emailLocal = emp.email?.includes('@')
    ? sanitizeUsername(emp.email.split('@')[0])
    : '';
  const code = sanitizeUsername(emp.employeeCode);
  const nameParts = emp.fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => sanitizeUsername(p));
  const last = nameParts[nameParts.length - 1] || '';
  const firstInitials = nameParts
    .slice(0, -1)
    .map((p) => p[0] || '')
    .join('');
  const nameGuess = sanitizeUsername(`${last}${firstInitials}`);
  return [...new Set([nameGuess, code, emailLocal].filter((s) => s.length >= 3))];
}

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%!';
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i += 1) out += pick(all);
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

function roleLabel(role: string) {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'MANAGER') return 'Quản lý';
  return 'Nhân viên';
}

export default function UserCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [emps, setEmps] = useState<EmpOpt[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck | null>(
    null,
  );
  const [checkingUser, setCheckingUser] = useState(false);
  const [passMode, setPassMode] = useState<'auto' | 'manual'>('auto');
  const [generated, setGenerated] = useState(() => generatePassword());
  const [manualPass, setManualPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<'EMPLOYEE' | 'MANAGER' | 'ADMIN'>(
    'EMPLOYEE',
  );
  const [activate, setActivate] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');

  const selected = useMemo(
    () => emps.find((e) => String(e.id) === employeeId) ?? null,
    [emps, employeeId],
  );

  const suggestions = useMemo(
    () => (selected ? suggestFromEmployee(selected) : []),
    [selected],
  );

  const password = passMode === 'auto' ? generated : manualPass;

  useEffect(() => {
    api
      .get('/users/unlinked-employees')
      .then((r) => setEmps(r.data))
      .catch(() => setError('Không tải được danh sách nhân sự chưa liên kết'));

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        employeeId?: string;
        username?: string;
        passMode?: 'auto' | 'manual';
        generated?: string;
        manualPass?: string;
        role?: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
        activate?: boolean;
      };
      if (draft.employeeId) setEmployeeId(draft.employeeId);
      if (draft.username) setUsername(draft.username);
      if (draft.passMode) setPassMode(draft.passMode);
      if (draft.generated) setGenerated(draft.generated);
      if (draft.manualPass) setManualPass(draft.manualPass);
      if (draft.role) setRole(draft.role);
      if (typeof draft.activate === 'boolean') setActivate(draft.activate);
    } catch {
      /* ignore bad draft */
    }
  }, []);

  useEffect(() => {
    if (!selected || username) return;
    const first = suggestFromEmployee(selected)[0];
    if (first) setUsername(first);
  }, [selected, username]);

  useEffect(() => {
    const value = username.trim().toLowerCase();
    if (!value) {
      setUsernameCheck(null);
      return;
    }
    setCheckingUser(true);
    const t = window.setTimeout(() => {
      api
        .get('/users/check-username', { params: { username: value } })
        .then((r) => setUsernameCheck(r.data))
        .catch(() =>
          setUsernameCheck({ available: false, reason: 'INVALID' }),
        )
        .finally(() => setCheckingUser(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [username]);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!employeeId) list.push('Chưa chọn nhân sự liên kết');
    if (!username.trim()) list.push('Chưa nhập username');
    else if (!usernameCheck?.available)
      list.push('Username chưa hợp lệ hoặc đã tồn tại');
    if (passMode === 'manual' && manualPass.length < 6)
      list.push('Mật khẩu thủ công tối thiểu 6 ký tự');
    if (passMode === 'auto' && generated.length < 6)
      list.push('Mật khẩu tự sinh chưa sẵn sàng');
    return list;
  }, [
    employeeId,
    username,
    usernameCheck,
    passMode,
    manualPass,
    generated,
  ]);

  const valid = errors.length === 0;

  const saveDraft = useCallback(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        employeeId,
        username,
        passMode,
        generated,
        manualPass,
        role,
        activate,
      }),
    );
    setDraftMsg('Đã lưu bản nháp trên máy này');
    window.setTimeout(() => setDraftMsg(''), 2500);
  }, [
    employeeId,
    username,
    passMode,
    generated,
    manualPass,
    role,
    activate,
  ]);

  async function onSubmit() {
    if (!valid) {
      setError(errors[0] || 'Biểu mẫu chưa hợp lệ');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/users', {
        username: username.trim().toLowerCase(),
        password,
        role,
        employeeId: Number(employeeId),
        status: activate ? 'ACTIVE' : 'LOCKED',
      });
      localStorage.removeItem(DRAFT_KEY);
      navigate('/users');
    } catch {
      setError('Tạo tài khoản thất bại — kiểm tra username/nhân sự đã liên kết');
    } finally {
      setSaving(false);
    }
  }

  async function copyPass() {
    try {
      await navigator.clipboard.writeText(password);
      setDraftMsg('Đã sao chép mật khẩu');
      window.setTimeout(() => setDraftMsg(''), 2000);
    } catch {
      setError('Không sao chép được mật khẩu');
    }
  }

  const validBadge = (() => {
    if (!username.trim()) return { cls: 'wait', text: 'Chờ nhập' };
    if (checkingUser) return { cls: 'wait', text: 'Đang kiểm tra…' };
    if (usernameCheck?.available)
      return { cls: 'ok', text: 'Duy nhất hợp lệ' };
    if (usernameCheck?.reason === 'TAKEN')
      return { cls: 'bad', text: 'Đã tồn tại' };
    if (usernameCheck?.reason === 'TOO_SHORT')
      return { cls: 'bad', text: 'Quá ngắn' };
    return { cls: 'bad', text: 'Không hợp lệ' };
  })();

  return (
    <div className="nx-uc">
      <nav className="nx-uc-crumb" aria-label="Breadcrumb">
        <span>Quản trị hệ thống</span>
        <span className="sep">›</span>
        <Link to="/users">Quản lý tài khoản</Link>
        <span className="sep">›</span>
        <span className="here">Thêm tài khoản mới</span>
      </nav>

      <h1 className="nx-uc-title">Khởi tạo Tài khoản Người dùng Mới</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {draftMsg && <Alert variant="success">{draftMsg}</Alert>}

      <div className="nx-uc-grid">
        <div className="nx-uc-main">
          <section className="nx-uc-card">
            <div className="nx-uc-sec-head">
              <span className="nx-uc-num">1</span>
              <h2>Thông tin liên kết nhân sự</h2>
              <span className="nx-uc-req">BẮT BUỘC</span>
            </div>
            <label className="nx-uc-label" htmlFor="emp-select">
              Hồ sơ nhân sự
            </label>
            <select
              id="emp-select"
              className="nx-uc-select"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setUsername('');
              }}
            >
              <option value="">— Chọn nhân viên chưa có tài khoản —</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.fullName}
                  {e.departmentName ? ` (${e.departmentName})` : ''}
                </option>
              ))}
            </select>
            {emps.length === 0 && (
              <p className="nx-uc-empty">
                Không còn nhân sự chưa liên kết. Tạo nhân viên mới trước tại{' '}
                <Link to="/employees">Quản lý nhân sự</Link>.
              </p>
            )}
            {selected && (
              <div className="nx-uc-sync">
                <div className="nx-uc-sync-title">Đồng bộ từ hồ sơ HR</div>
                <div className="nx-uc-sync-grid">
                  <div className="nx-uc-person">
                    <div className="av">{initials(selected.fullName)}</div>
                    <div>
                      <span>Họ tên</span>
                      <strong>{selected.fullName}</strong>
                    </div>
                  </div>
                  <div className="nx-uc-field">
                    <span>Email công việc</span>
                    <strong>{selected.email || '—'}</strong>
                  </div>
                  <div className="nx-uc-field">
                    <span>Phòng ban</span>
                    <strong>{selected.departmentName || '—'}</strong>
                  </div>
                  <div className="nx-uc-field">
                    <span>Chức danh</span>
                    <strong>{selected.position || '—'}</strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="nx-uc-card">
            <div className="nx-uc-sec-head">
              <span className="nx-uc-num">2</span>
              <h2>Thông tin đăng nhập &amp; xác thực</h2>
            </div>
            <label className="nx-uc-label" htmlFor="username">
              Username
            </label>
            <div className="nx-uc-user-row">
              <div className="nx-uc-user-input">
                <span className="at">@</span>
                <input
                  id="username"
                  value={username}
                  onChange={(e) =>
                    setUsername(sanitizeUsername(e.target.value))
                  }
                  placeholder="vd: tuanta"
                  autoComplete="off"
                />
              </div>
              <span className={`nx-uc-valid ${validBadge.cls}`}>
                {validBadge.text}
              </span>
            </div>
            {suggestions.length > 0 && (
              <div className="nx-uc-suggest">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="nx-uc-chip"
                    onClick={() => setUsername(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <label className="nx-uc-label" style={{ marginTop: '1.1rem' }}>
              Mật khẩu khởi tạo
            </label>
            <div className="nx-uc-pass-opts">
              <label
                className={`nx-uc-pass-opt ${passMode === 'auto' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="passMode"
                  checked={passMode === 'auto'}
                  onChange={() => setPassMode('auto')}
                />
                <div style={{ flex: 1 }}>
                  <strong>Tự sinh mật khẩu an toàn (khuyến nghị)</strong>
                  <p>Hệ thống tạo chuỗi ngẫu nhiên; hãy sao chép trước khi lưu.</p>
                  {passMode === 'auto' && (
                    <div className="nx-uc-gen-row">
                      <code>{showPass ? generated : '••••••••••••'}</code>
                      <button
                        type="button"
                        className="nx-btn-outline"
                        onClick={() => setShowPass((v) => !v)}
                      >
                        {showPass ? 'Ẩn' : 'Hiện'}
                      </button>
                      <button
                        type="button"
                        className="nx-btn-outline"
                        onClick={() => void copyPass()}
                      >
                        Sao chép
                      </button>
                      <button
                        type="button"
                        className="nx-btn-outline"
                        onClick={() => setGenerated(generatePassword())}
                      >
                        Đổi
                      </button>
                    </div>
                  )}
                </div>
              </label>
              <label
                className={`nx-uc-pass-opt ${passMode === 'manual' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="passMode"
                  checked={passMode === 'manual'}
                  onChange={() => setPassMode('manual')}
                />
                <div style={{ flex: 1 }}>
                  <strong>Thiết lập thủ công</strong>
                  <p>Nhập mật khẩu tạm thời (tối thiểu 6 ký tự).</p>
                  {passMode === 'manual' && (
                    <input
                      className="nx-uc-input"
                      style={{ marginTop: '0.65rem' }}
                      type={showPass ? 'text' : 'password'}
                      value={manualPass}
                      minLength={6}
                      onChange={(e) => setManualPass(e.target.value)}
                      placeholder="Mật khẩu tạm"
                    />
                  )}
                </div>
              </label>
            </div>
          </section>

          <section className="nx-uc-card">
            <div className="nx-uc-sec-head">
              <span className="nx-uc-num">3</span>
              <h2>Phân vai trò &amp; thẩm quyền</h2>
            </div>
            <div className="nx-uc-roles">
              <label
                className={`nx-uc-role ${role === 'EMPLOYEE' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === 'EMPLOYEE'}
                  onChange={() => setRole('EMPLOYEE')}
                />
                <div>
                  <h3>EMPLOYEE — Nhân viên</h3>
                  <p>
                    Truy cập dashboard cá nhân, chấm công, nghỉ phép và công việc
                    được giao.
                  </p>
                </div>
                <span className="nx-uc-tag def">MẶC ĐỊNH</span>
              </label>
              <label
                className={`nx-uc-role ${role === 'MANAGER' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === 'MANAGER'}
                  onChange={() => setRole('MANAGER')}
                />
                <div>
                  <h3>MANAGER — Quản lý phòng ban</h3>
                  <p>
                    Duyệt nghỉ phép / theo dõi nhân sự và công việc trong phạm vi
                    phòng ban quản lý.
                  </p>
                </div>
                <span className="nx-uc-tag mid">CẤP TRUNG</span>
              </label>
              <label
                className={`nx-uc-role ${role === 'ADMIN' ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === 'ADMIN'}
                  onChange={() => setRole('ADMIN')}
                />
                <div>
                  <h3>ADMIN — Quản trị viên hệ thống</h3>
                  <p>
                    Toàn quyền cấu hình tài khoản, nhân sự, phòng ban và nhật ký
                    hệ thống.
                  </p>
                  {role === 'ADMIN' && (
                    <div className="nx-uc-warn">
                      Chỉ cấp ADMIN khi thật sự cần — quyền này mở toàn bộ module
                      quản trị.
                    </div>
                  )}
                </div>
                <span className="nx-uc-tag full">TOÀN QUYỀN</span>
              </label>
            </div>
          </section>
        </div>

        <aside className="nx-uc-side">
          <div className="nx-uc-side-card">
            <h3>Kích hoạt &amp; thông báo</h3>
            <div className="nx-uc-toggle">
              <span>Kích hoạt ngay (ACTIVE)</span>
              <label className="nx-switch">
                <input
                  type="checkbox"
                  checked={activate}
                  onChange={(e) => setActivate(e.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
            <p className="nx-uc-empty" style={{ marginTop: '0.65rem' }}>
              Tắt = tạo tài khoản ở trạng thái LOCKED, chưa đăng nhập được.
            </p>
          </div>

          <div className="nx-uc-side-card nx-uc-sum">
            <h3>Tóm tắt khởi tạo</h3>
            <dl>
              <div>
                <dt>Mã nhân viên</dt>
                <dd>{selected?.employeeCode || '—'}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{username ? `@${username}` : '—'}</dd>
              </div>
              <div>
                <dt>Vai trò</dt>
                <dd>
                  <span className={`nx-role-pill ${role.toLowerCase()}`}>
                    {role}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{activate ? 'ACTIVE' : 'LOCKED'}</dd>
              </div>
              <div>
                <dt>Người tạo</dt>
                <dd>
                  {user?.username || '—'} ({roleLabel(user?.role || '')})
                </dd>
              </div>
            </dl>
          </div>

          <div className="nx-uc-help">
            Vai trò quyết định phạm vi API theo RolesGuard. Xem thêm tại{' '}
            <Link to="/logs">nhật ký hệ thống</Link> sau khi tạo để kiểm tra sự
            kiện USER_CREATE.
          </div>
        </aside>
      </div>

      <div className="nx-uc-foot">
        <div className={`nx-uc-foot-msg ${valid ? 'ok' : 'bad'}`}>
          {valid
            ? 'Dữ liệu biểu mẫu đã được xác thực sơ bộ hợp lệ (0 lỗi)'
            : `Còn ${errors.length} lỗi: ${errors[0]}`}
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => navigate('/users')}
        >
          Hủy bỏ
        </button>
        <button type="button" className="nx-btn-outline" onClick={saveDraft}>
          Lưu bản nháp
        </button>
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving || !valid}
          onClick={() => void onSubmit()}
        >
          {saving ? 'Đang tạo…' : 'Xác nhận tạo tài khoản (AD-04)'}
        </button>
      </div>
    </div>
  );
}
