import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/employee-detail.css';

type Account =
  | {
      linked: true;
      id: number;
      username: string;
      role: string;
      status: string;
      locked: boolean;
    }
  | { linked: false };

type Detail = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: number | null;
  departmentName: string | null;
  position: string;
  hireDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationalId?: string | null;
  nationalIdMasked: string | null;
  permanentAddress: string | null;
  temporaryAddress: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  contractType: string | null;
  photoKey: string | null;
  status: string;
  seniority: string | null;
  account: Account;
  metrics: {
    label: string;
    attendanceDays: number;
    attendanceExpected: number;
    attendancePct: number;
    taskTotal: number;
    taskProgressPct: number;
    leaveUsed: number;
    leaveQuota: number;
    leaveRemaining: number;
    leaveRemainingPct: number;
  };
};

type AuditRow = {
  id: number;
  createdAt: string;
  action: string;
  actorUsername: string;
  metadata: Record<string, unknown> | null;
};

type Dept = { id: number; name: string };
type EmpOpt = { id: number; fullName: string; employeeCode: string; position?: string };

type FormState = {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  nationalId: string;
  email: string;
  phone: string;
  departmentId: string;
  position: string;
  managerEmployeeId: string;
  contractType: string;
  permanentAddress: string;
  temporaryAddress: string;
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
  if (!Number.isNaN(d.getTime()) && iso.includes('T')) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const [y, m, day] = iso.slice(0, 10).split('-');
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    EMPLOYEE_CREATE: 'Tiếp nhận mới',
    EMPLOYEE_UPDATE: 'Cập nhật hồ sơ',
    EMPLOYEE_STATUS_CHANGE: 'Đổi trạng thái',
    EMPLOYEE_POSITION_CHANGE: 'Bổ nhiệm / đổi chức vụ',
    EMPLOYEE_PHOTO_UPLOAD: 'Cập nhật ảnh',
  };
  return map[action] || action;
}

function contractLabel(c: string | null) {
  if (c === 'PROBATION') return 'Thử việc';
  if (c === 'OFFICIAL') return 'Chính thức có thời hạn';
  if (c === 'INDEFINITE') return 'Chính thức vô thời hạn';
  if (c === 'INTERN') return 'Thực tập';
  return c || '—';
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') return { cls: 'on', text: 'ĐANG LÀM VIỆC' };
  if (status === 'SUSPENDED') return { cls: 'warn', text: 'TẠM NGƯNG' };
  return { cls: 'off', text: 'ĐÃ NGHỈ VIỆC' };
}

function toForm(d: Detail): FormState {
  return {
    fullName: d.fullName || '',
    dateOfBirth: d.dateOfBirth?.slice(0, 10) || '',
    gender: d.gender || 'MALE',
    nationalId: d.nationalId || '',
    email: d.email || '',
    phone: d.phone || '',
    departmentId: d.departmentId ? String(d.departmentId) : '',
    position: d.position || '',
    managerEmployeeId: d.managerEmployeeId ? String(d.managerEmployeeId) : '',
    contractType: d.contractType || 'OFFICIAL',
    permanentAddress: d.permanentAddress || '',
    temporaryAddress: d.temporaryAddress || '',
  };
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canAdmin = user?.role === 'ADMIN';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [managers, setManagers] = useState<EmpOpt[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [showId, setShowId] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [tempPass, setTempPass] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.get(`/employees/${id}`),
        api.get(`/employees/${id}/audit`, { params: { limit: 40 } }),
      ]);
      setDetail(d.data);
      setForm(toForm(d.data));
      setAudit(a.data);
      setError('');
    } catch {
      setError('Không tải được hồ sơ nhân sự');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
    api
      .get('/employees/options')
      .then((r) => setManagers(r.data))
      .catch(() => undefined);
  }, [load]);

  const dirty = useMemo(() => {
    if (!detail || !form) return false;
    const base = toForm(detail);
    return JSON.stringify(base) !== JSON.stringify(form);
  }, [detail, form]);

  const badge = detail ? statusBadge(detail.status) : null;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveProfile() {
    if (!detail || !form) return;
    if (!form.email.trim() || !form.phone.trim()) {
      setError('Email và SĐT là bắt buộc');
      return;
    }
    if (canManage && !form.fullName.trim()) {
      setError('Họ tên là bắt buộc');
      return;
    }
    setSaving(true);
    try {
      if (canManage) {
        await api.patch(`/employees/${detail.id}`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender || null,
          nationalId: form.nationalId.trim() || null,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
          position: form.position.trim(),
          managerEmployeeId: form.managerEmployeeId
            ? Number(form.managerEmployeeId)
            : null,
          contractType: form.contractType || null,
          permanentAddress: form.permanentAddress.trim() || null,
          temporaryAddress: form.temporaryAddress.trim() || null,
        });
      } else {
        await api.patch(`/employees/${detail.id}`, {
          email: form.email.trim(),
          phone: form.phone.trim(),
          temporaryAddress: form.temporaryAddress.trim() || null,
        });
      }
      setOkMsg('Đã cập nhật hồ sơ nhân sự');
      await load();
    } catch {
      setError('Cập nhật hồ sơ thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') {
    if (!detail || !canManage) return;
    setSaving(true);
    try {
      await api.patch(`/employees/${detail.id}`, { status });
      setOkMsg(
        status === 'ACTIVE'
          ? 'Đã kích hoạt lại'
          : status === 'SUSPENDED'
            ? 'Đã tạm ngưng công tác'
            : 'Đã chuyển trạng thái nghỉ việc',
      );
      await load();
    } catch {
      setError('Cập nhật trạng thái thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!detail?.account.linked || !canAdmin) return;
    setSaving(true);
    try {
      const { data } = await api.post(
        `/users/${detail.account.id}/reset-password`,
      );
      setTempPass(data.temporaryPassword);
      setOkMsg('Đã tạo mật khẩu tạm');
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

  if (!detail || !form) {
    return (
      <Alert variant="danger">
        {error || 'Không tìm thấy nhân sự'} <Link to="/employees">Quay lại</Link>
      </Alert>
    );
  }

  const photoUrl = detail.photoKey
    ? `${apiBase}/employees/photo/${detail.photoKey}`
    : null;

  return (
    <div className="nx-ed">
      <div className="nx-ed-top">
        <div>
          <nav className="nx-ed-crumb">
            <span>Quản trị hệ thống</span>
            <span className="sep">›</span>
            <Link to="/employees">Quản lý nhân sự</Link>
            <span className="sep">›</span>
            <span className="here">
              Chi tiết: {detail.employeeCode} ({detail.fullName})
            </span>
          </nav>
          <h1>Hồ Sơ Nhân Sự Chi Tiết &amp; Cập Nhật</h1>
        </div>
        <Link to="/employees" className="nx-btn-outline">
          Quay lại danh sách
        </Link>
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

      <div className="nx-ed-grid">
        <aside>
          <div className="nx-ed-card nx-ed-profile">
            <div className="nx-ed-avatar">
              {photoUrl ? (
                <img src={photoUrl} alt={detail.fullName} />
              ) : (
                initials(detail.fullName)
              )}
            </div>
            {badge && <span className={`nx-ed-badge ${badge.cls}`}>{badge.text}</span>}
            <h2>{detail.fullName}</h2>
            <p className="sub">
              {detail.employeeCode} · {detail.position || '—'}
            </p>
            <div className="nx-ed-quick">
              <div>
                <span>Phòng ban</span>
                <strong>{detail.departmentName || '—'}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{detail.email || '—'}</strong>
              </div>
              <div>
                <span>Điện thoại</span>
                <strong>{detail.phone || '—'}</strong>
              </div>
              <div>
                <span>Ngày vào làm</span>
                <strong>{fmtDate(detail.hireDate)}</strong>
              </div>
              <div>
                <span>Thâm niên</span>
                <strong>{detail.seniority || '—'}</strong>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="nx-ed-card nx-ed-ops">
              <h3>Vận hành &amp; trạng thái</h3>
              <div className="row">
                <span>Trạng thái hồ sơ</span>
                {badge && (
                  <span className={`nx-ed-badge ${badge.cls}`}>{badge.text}</span>
                )}
              </div>
              <div className="actions">
                {detail.status !== 'SUSPENDED' && (
                  <button
                    type="button"
                    className="nx-ed-btn-warn"
                    disabled={saving}
                    onClick={() => void setStatus('SUSPENDED')}
                  >
                    Tạm ngưng công tác
                  </button>
                )}
                {detail.status !== 'INACTIVE' && (
                  <button
                    type="button"
                    className="nx-ed-btn-danger"
                    disabled={saving}
                    onClick={() => void setStatus('INACTIVE')}
                  >
                    Ngừng hoạt động / Nghỉ việc
                  </button>
                )}
                {detail.status !== 'ACTIVE' && (
                  <button
                    type="button"
                    className="nx-ed-btn-ok"
                    disabled={saving}
                    onClick={() => void setStatus('ACTIVE')}
                  >
                    Kích hoạt lại (ACTIVE)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="nx-ed-card">
            <h3>Chỉ số vận hành tháng này — {detail.metrics.label}</h3>
            <div className="nx-ed-metrics">
              <div className="nx-ed-metric">
                <span>Chấm công</span>
                <strong>
                  {detail.metrics.attendanceDays}/
                  {detail.metrics.attendanceExpected} ngày (
                  {detail.metrics.attendancePct}%)
                </strong>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, detail.metrics.attendancePct)}%` }} />
                </div>
              </div>
              <div className="nx-ed-metric">
                <span>Công việc</span>
                <strong>
                  {detail.metrics.taskTotal} việc · tiến độ TB{' '}
                  {detail.metrics.taskProgressPct}%
                </strong>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.min(100, detail.metrics.taskProgressPct)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="nx-ed-metric">
                <span>Phép còn lại (quota năm {detail.metrics.leaveQuota} ngày)</span>
                <strong>
                  {detail.metrics.leaveRemaining} / {detail.metrics.leaveQuota}{' '}
                  ({detail.metrics.leaveRemainingPct}%)
                </strong>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.min(100, detail.metrics.leaveRemainingPct)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <section className="nx-ed-card">
            <h2>Hồ sơ lý lịch &amp; vị trí công tác</h2>
            <div className="nx-ed-form">
              <div className="nx-ed-field">
                <label>Mã nhân viên</label>
                <input value={detail.employeeCode} disabled />
              </div>
              <div className="nx-ed-field">
                <label>Họ và tên *</label>
                <input
                  value={form.fullName}
                  disabled={!canManage}
                  onChange={(e) => setField('fullName', e.target.value)}
                />
              </div>
              <div className="nx-ed-field">
                <label>Ngày sinh</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  disabled={!canManage}
                  onChange={(e) => setField('dateOfBirth', e.target.value)}
                />
              </div>
              <div className="nx-ed-field">
                <label>Giới tính</label>
                <select
                  value={form.gender}
                  disabled={!canManage}
                  onChange={(e) => setField('gender', e.target.value)}
                >
                  <option value="MALE">Nam</option>
                  <option value="FEMALE">Nữ</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>
              <div className="nx-ed-field">
                <label>CCCD / Hộ chiếu</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ flex: 1 }}
                    value={
                      showId
                        ? form.nationalId || detail.nationalIdMasked || ''
                        : detail.nationalIdMasked || '—'
                    }
                    disabled={!canManage || !showId}
                    onChange={(e) => setField('nationalId', e.target.value)}
                  />
                  <button
                    type="button"
                    className="nx-btn-outline"
                    onClick={() => setShowId((v) => !v)}
                  >
                    {showId ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>
              <div className="nx-ed-field">
                <label>Email công vụ *</label>
                <input
                  value={form.email}
                  disabled={!canManage && user?.role !== 'EMPLOYEE'}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </div>
              <div className="nx-ed-field">
                <label>Số điện thoại *</label>
                <input
                  value={form.phone}
                  disabled={!canManage && user?.role !== 'EMPLOYEE'}
                  onChange={(e) => setField('phone', e.target.value)}
                />
              </div>
              <div className="nx-ed-field">
                <label>Phòng ban</label>
                <select
                  value={form.departmentId}
                  disabled={!canManage}
                  onChange={(e) => setField('departmentId', e.target.value)}
                >
                  <option value="">— Chưa gán —</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nx-ed-field">
                <label>Chức vụ</label>
                <input
                  value={form.position}
                  disabled={!canManage}
                  onChange={(e) => setField('position', e.target.value)}
                />
              </div>
              <div className="nx-ed-field">
                <label>Quản lý trực tiếp</label>
                <select
                  value={form.managerEmployeeId}
                  disabled={!canManage}
                  onChange={(e) =>
                    setField('managerEmployeeId', e.target.value)
                  }
                >
                  <option value="">— Chưa gán —</option>
                  {managers
                    .filter((m) => m.id !== detail.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                        {m.position ? ` — ${m.position}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="nx-ed-field">
                <label>Loại hợp đồng</label>
                <select
                  value={form.contractType}
                  disabled={!canManage}
                  onChange={(e) => setField('contractType', e.target.value)}
                >
                  <option value="PROBATION">Thử việc</option>
                  <option value="OFFICIAL">Chính thức có thời hạn</option>
                  <option value="INDEFINITE">Chính thức vô thời hạn</option>
                  <option value="INTERN">Thực tập</option>
                </select>
              </div>
              <div className="nx-ed-field full">
                <label>Địa chỉ thường trú</label>
                <textarea
                  value={form.permanentAddress}
                  disabled={!canManage}
                  onChange={(e) =>
                    setField('permanentAddress', e.target.value)
                  }
                />
              </div>
              <div className="nx-ed-field full">
                <label>Địa chỉ tạm trú</label>
                <textarea
                  value={form.temporaryAddress}
                  disabled={!canManage && user?.role !== 'EMPLOYEE'}
                  onChange={(e) =>
                    setField('temporaryAddress', e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          <section className="nx-ed-card">
            <h2>Tài khoản hệ thống liên kết</h2>
            {!detail.account.linked ? (
              <div>
                <p className="text-muted mb-2">Chưa cấp tài khoản đăng nhập.</p>
                {canAdmin && (
                  <Link to="/users/new" className="nx-btn-primary">
                    Cấp tài khoản mới
                  </Link>
                )}
              </div>
            ) : (
              <div className="nx-ed-acc">
                <div className="nx-ed-acc-meta">
                  <div>
                    <strong>@{detail.account.username}</strong> · UID ACC-
                    {String(detail.account.id).padStart(5, '0')}
                  </div>
                  <div>
                    Vai trò RBAC: <strong>{detail.account.role}</strong>
                    {detail.account.locked ? ' · Đã khóa' : ' · Hoạt động'}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                    Hợp đồng hồ sơ: {contractLabel(detail.contractType)}
                  </div>
                </div>
                <div className="nx-ed-acc-actions">
                  {canAdmin && (
                    <button
                      type="button"
                      className="nx-btn-outline"
                      disabled={saving}
                      onClick={() => void resetPassword()}
                    >
                      Đặt lại mật khẩu
                    </button>
                  )}
                  <Link
                    to={`/users/${detail.account.id}`}
                    className="nx-btn-primary"
                  >
                    Chi tiết tài khoản
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section className="nx-ed-card">
            <h2>Lịch sử điều chỉnh hồ sơ &amp; bổ nhiệm</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="nx-ed-audit">
                <thead>
                  <tr>
                    <th>Thời điểm</th>
                    <th>Sự kiện</th>
                    <th>Chi tiết</th>
                    <th>Người thực hiện</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        Chưa có nhật ký trên hồ sơ này.
                      </td>
                    </tr>
                  )}
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDate(row.createdAt)}</td>
                      <td>
                        <strong>{actionLabel(row.action)}</strong>
                      </td>
                      <td>
                        {row.metadata
                          ? Object.entries(row.metadata)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')
                          : '—'}
                      </td>
                      <td>{row.actorUsername}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className="nx-ed-foot">
        <div className="hint">
          {user?.role === 'EMPLOYEE'
            ? 'Nhân viên chỉ được sửa một số thông tin liên hệ (US-16).'
            : 'Chế độ xem & chỉnh sửa trực tiếp — lưu qua API PATCH.'}
        </div>
        <button
          type="button"
          className="nx-btn-outline"
          onClick={() => {
            setForm(toForm(detail));
            navigate('/employees');
          }}
        >
          Hủy thay đổi
        </button>
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving || !dirty}
          onClick={() => void saveProfile()}
        >
          {saving ? 'Đang lưu…' : 'Cập nhật hồ sơ nhân sự (AD-08)'}
        </button>
      </div>

      <Modal show={!!tempPass} onHide={() => setTempPass(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Mật khẩu tạm</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <code
            style={{
              display: 'block',
              padding: '0.75rem',
              background: '#f4f7f6',
              borderRadius: 8,
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
