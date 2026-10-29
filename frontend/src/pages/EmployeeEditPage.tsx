import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
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
  departmentCode: string | null;
  position: string;
  hireDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationalId?: string | null;
  permanentAddress: string | null;
  temporaryAddress: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  contractType: string | null;
  status: string;
  yearsOfService: number | null;
  projects: string[];
  account: Account;
  metrics: {
    leaveRemaining: number;
    leaveQuota: number;
    attendancePct: number;
    taskDone: number;
    taskTotal: number;
  };
};

type EmpOpt = {
  id: number;
  fullName: string;
  employeeCode: string;
  position?: string;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  permanentAddress: string;
  temporaryAddress: string;
  position: string;
  managerEmployeeId: string;
  contractType: string;
  hireDate: string;
  nationalId: string;
  status: string;
};

function toForm(d: Detail): FormState {
  return {
    fullName: d.fullName || '',
    email: d.email || '',
    phone: d.phone || '',
    dateOfBirth: d.dateOfBirth?.slice(0, 10) || '',
    gender: d.gender || 'MALE',
    permanentAddress: d.permanentAddress || '',
    temporaryAddress: d.temporaryAddress || '',
    position: d.position || '',
    managerEmployeeId: d.managerEmployeeId ? String(d.managerEmployeeId) : '',
    contractType: d.contractType || 'OFFICIAL',
    hireDate: d.hireDate?.slice(0, 10) || '',
    nationalId: d.nationalId || '',
    status: d.status || 'ACTIVE',
  };
}

export default function EmployeeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isManager = user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [managers, setManagers] = useState<EmpOpt[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectDraft, setProjectDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${id}`);
      setDetail(data);
      setForm(toForm(data));
      setProjects(data.projects || []);
      setError('');
    } catch {
      setError('Không tải được hồ sơ');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    api
      .get('/employees/options')
      .then((r) => setManagers(r.data))
      .catch(() => undefined);
  }, [load]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!detail || !form) return;

    const isSelf = user?.employeeId === detail.id && !canManage;
    if (!isSelf && !canManage) {
      setError('Không có quyền cập nhật');
      return;
    }

    if (canManage && !form.fullName.trim()) {
      setError('Họ tên là bắt buộc');
      return;
    }
    if (!form.email.trim() || !form.phone.trim()) {
      setError('Email và SĐT là bắt buộc');
      return;
    }

    setSaving(true);
    try {
      if (isSelf) {
        await api.patch(`/employees/${detail.id}`, {
          email: form.email.trim(),
          phone: form.phone.trim(),
          temporaryAddress: form.temporaryAddress.trim() || null,
        });
      } else {
        await api.patch(`/employees/${detail.id}`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender || null,
          nationalId: form.nationalId.trim() || null,
          permanentAddress: form.permanentAddress.trim() || null,
          temporaryAddress: form.temporaryAddress.trim() || null,
          position: form.position.trim(),
          managerEmployeeId: form.managerEmployeeId
            ? Number(form.managerEmployeeId)
            : null,
          contractType: form.contractType || null,
          hireDate: form.hireDate || null,
          ...(isAdmin ? { status: form.status } : {}),
          // Manager: không gửi departmentId (API khóa đổi PB)
          ...(isAdmin
            ? { departmentId: detail.departmentId }
            : {}),
        });
      }
      navigate(`/employees/${detail.id}`);
    } catch {
      setError('Cập nhật hồ sơ thất bại');
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
        {error || 'Không tìm thấy'} <Link to="/employees">Quay lại</Link>
      </Alert>
    );
  }

  const isSelfOnly = !canManage && user?.employeeId === detail.id;

  return (
    <div className="nx-ed nx-ed-edit">
      <div className="nx-ed-top">
        <div>
          <nav className="nx-ed-crumb">
            <Link to={`/employees/${detail.id}`}>← Quay lại</Link>
            <span className="sep">›</span>
            <span>{isManager ? 'Quản trị quản lý' : 'Quản trị hệ thống'}</span>
            <span className="sep">›</span>
            <span>Phân hệ Nhân sự</span>
            <span className="sep">›</span>
            <span className="here">Thêm &amp; Chỉnh sửa thông tin nhân sự</span>
          </nav>
          <h1>Cập Nhật Hồ Sơ Nhân Viên</h1>
          <p className="nx-ed-edit-sub">
            Đang chỉnh sửa nhân sự: <strong>{detail.fullName}</strong> — Mã định
            danh: <strong>{detail.employeeCode}</strong>
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="nx-ed-edit-grid">
          <div>
            <section className="nx-ed-card">
              <div className="nx-ed-sec-head">
                <h2>1. Định danh &amp; tài khoản</h2>
                <span className="nx-ed-lock-badge">Admin Control Only</span>
              </div>
              <div className="nx-ed-form">
                <div className="nx-ed-field">
                  <label>Mã nhân viên hệ thống</label>
                  <input value={detail.employeeCode} disabled />
                </div>
                <div className="nx-ed-field">
                  <label>Tên đăng nhập (SSO)</label>
                  <input
                    value={
                      detail.account.linked
                        ? detail.account.username
                        : 'Chưa cấp tài khoản'
                    }
                    disabled
                  />
                </div>
                <div className="nx-ed-field">
                  <label>Vai trò bảo mật (RBAC)</label>
                  <input
                    value={
                      detail.account.linked
                        ? detail.account.role
                        : '—'
                    }
                    disabled
                  />
                  <small className="hint">
                    Manager không được nâng quyền lên Admin.
                  </small>
                </div>
                <div className="nx-ed-field">
                  <label>Trạng thái đăng nhập</label>
                  <input
                    value={
                      !detail.account.linked
                        ? 'CHƯA CẤP'
                        : detail.account.locked
                          ? 'LOCKED'
                          : 'ACTIVE (HOẠT ĐỘNG)'
                    }
                    disabled
                  />
                </div>
                {isAdmin && (
                  <div className="nx-ed-field">
                    <label>Trạng thái hồ sơ nhân sự</label>
                    <select
                      value={form.status}
                      onChange={(e) => setField('status', e.target.value)}
                    >
                      <option value="ACTIVE">Đang làm việc</option>
                      <option value="SUSPENDED">Tạm ngưng</option>
                      <option value="INACTIVE">Nghỉ việc</option>
                    </select>
                  </div>
                )}
              </div>
            </section>

            <section className="nx-ed-card">
              <h2>2. Thông tin cá nhân &amp; liên hệ</h2>
              <div className="nx-ed-form">
                <div className="nx-ed-field">
                  <label>Họ và tên đầy đủ *</label>
                  <input
                    value={form.fullName}
                    disabled={isSelfOnly}
                    onChange={(e) => setField('fullName', e.target.value)}
                    required={!isSelfOnly}
                  />
                </div>
                <div className="nx-ed-field">
                  <label>Email công việc *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    required
                  />
                </div>
                <div className="nx-ed-field">
                  <label>Số điện thoại liên hệ *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    required
                  />
                </div>
                <div className="nx-ed-field">
                  <label>Ngày sinh</label>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    disabled={isSelfOnly}
                    onChange={(e) => setField('dateOfBirth', e.target.value)}
                  />
                </div>
                <div className="nx-ed-field full">
                  <label>Giới tính</label>
                  <div className="nx-ed-seg">
                    {(
                      [
                        ['MALE', 'Nam'],
                        ['FEMALE', 'Nữ'],
                        ['OTHER', 'Khác'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={form.gender === v ? 'on' : undefined}
                        disabled={isSelfOnly}
                        onClick={() => setField('gender', v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="nx-ed-field full">
                  <label>Địa chỉ thường trú</label>
                  <input
                    value={form.permanentAddress}
                    disabled={isSelfOnly}
                    onChange={(e) =>
                      setField('permanentAddress', e.target.value)
                    }
                  />
                </div>
                <div className="nx-ed-field full">
                  <label>Địa chỉ tạm trú</label>
                  <input
                    value={form.temporaryAddress}
                    onChange={(e) =>
                      setField('temporaryAddress', e.target.value)
                    }
                  />
                </div>
                {canManage && (
                  <div className="nx-ed-field">
                    <label>CCCD / Định danh</label>
                    <input
                      value={form.nationalId}
                      onChange={(e) => setField('nationalId', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </section>

            {canManage && (
              <section className="nx-ed-card">
                <h2>3. Vị trí &amp; phân công quản lý</h2>
                <div className="nx-ed-form">
                  <div className="nx-ed-field">
                    <label>Đơn vị / Phòng ban</label>
                    <input
                      value={
                        detail.departmentName
                          ? `${detail.departmentName}${
                              detail.departmentCode
                                ? ` (${detail.departmentCode})`
                                : ''
                            }`
                          : '—'
                      }
                      disabled
                    />
                    {isManager && (
                      <small className="hint">
                        Manager không đổi phòng ban nhân sự thuộc phạm vi.
                      </small>
                    )}
                  </div>
                  <div className="nx-ed-field">
                    <label>Chức vụ &amp; chức danh chuyên môn</label>
                    <input
                      value={form.position}
                      onChange={(e) => setField('position', e.target.value)}
                      list="nx-pos-list"
                    />
                    <datalist id="nx-pos-list">
                      <option value="Trưởng phòng" />
                      <option value="Tech Lead" />
                      <option value="Software Engineer" />
                      <option value="Nhân viên" />
                    </datalist>
                  </div>
                  <div className="nx-ed-field">
                    <label>Cán bộ quản lý trực tiếp</label>
                    <select
                      value={form.managerEmployeeId}
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
                            {user?.employeeId === m.id ? ' (Bạn)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="nx-ed-field">
                    <label>Loại hợp đồng</label>
                    <select
                      value={form.contractType}
                      onChange={(e) =>
                        setField('contractType', e.target.value)
                      }
                    >
                      <option value="PROBATION">Thử việc</option>
                      <option value="OFFICIAL">
                        Chính thức (có thời hạn)
                      </option>
                      <option value="INDEFINITE">
                        Chính thức (không xác định thời hạn)
                      </option>
                      <option value="INTERN">Thực tập</option>
                    </select>
                  </div>
                  <div className="nx-ed-field">
                    <label>Ngày bắt đầu làm</label>
                    <input
                      type="date"
                      value={form.hireDate}
                      onChange={(e) => setField('hireDate', e.target.value)}
                    />
                  </div>
                </div>
              </section>
            )}

            {canManage && (
              <section className="nx-ed-card">
                <h2>4. Dự án tham gia (tham chiếu từ task)</h2>
                <div className="nx-ed-tags">
                  {projects.length === 0 && (
                    <span className="muted">Chưa gắn dự án qua công việc.</span>
                  )}
                  {projects.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
                <div className="nx-ed-project-add">
                  <input
                    value={projectDraft}
                    placeholder="Ghi chú dự án (chỉ hiển thị cục bộ)"
                    onChange={(e) => setProjectDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="nx-btn-outline"
                    onClick={() => {
                      const v = projectDraft.trim();
                      if (!v || projects.includes(v)) return;
                      setProjects((prev) => [...prev, v]);
                      setProjectDraft('');
                    }}
                  >
                    + Thêm dự án
                  </button>
                </div>
                <small className="hint">
                  Dự án chính thức lấy từ field project trên task; ghi chú thêm
                  chỉ để tham chiếu khi cập nhật hồ sơ.
                </small>
              </section>
            )}
          </div>

          <aside>
            <section className="nx-ed-card nx-ed-perf">
              <h3>CHỈ SỐ GẮN BÓ &amp; HIỆU SUẤT</h3>
              <div className="nx-ed-perf-grid">
                <div>
                  <strong>{detail.yearsOfService ?? '—'}</strong>
                  <span>Năm công tác</span>
                </div>
                <div>
                  <strong>
                    {detail.metrics.taskDone}/{detail.metrics.taskTotal || 0}
                  </strong>
                  <span>Task hoàn thành</span>
                </div>
                <div>
                  <strong>{detail.metrics.attendancePct}%</strong>
                  <span>Chấm công hợp lệ</span>
                </div>
              </div>
              <p className="hint">
                Phép còn lại: {detail.metrics.leaveRemaining}/
                {detail.metrics.leaveQuota} ngày
              </p>
            </section>
          </aside>
        </div>

        <div className="nx-ed-foot">
          <Link to={`/employees/${detail.id}`} className="nx-btn-outline">
            Hủy bỏ
          </Link>
          <button type="submit" className="nx-btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Xác nhận & Cập nhật hồ sơ'}
          </button>
        </div>
      </form>
    </div>
  );
}
