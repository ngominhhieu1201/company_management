import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/department-detail.css';

type EmpBrief = {
  id: number;
  fullName: string;
  employeeCode: string;
  position: string | null;
  email?: string;
  hireDate?: string | null;
  status?: string;
};

type Member = EmpBrief & {
  email: string;
  status: string;
  hireDate: string | null;
};

type Detail = {
  id: number;
  departmentCode: string;
  name: string;
  description: string | null;
  managerEmployeeId: number | null;
  manager: EmpBrief | null;
  deputyEmployeeId: number | null;
  deputy: EmpBrief | null;
  parentDepartmentId: number | null;
  parent: { id: number; departmentCode: string; name: string } | null;
  headcount: number;
  headcountTarget: number | null;
  fillPct: number | null;
  slotsLeft: number | null;
  foundedAt: string | null;
  yearsActive: string | null;
  location: string | null;
  contactEmail: string | null;
  category: string | null;
  recruitmentPaused: boolean;
  status: string;
  members: Member[];
  metrics: {
    label: string;
    taskActive: number;
    taskOnTimePct: number | null;
    attendancePct: number | null;
    attendanceDelta: number | null;
  };
};

type AuditRow = {
  id: number;
  createdAt: string;
  action: string;
  actorUsername: string;
  metadata: Record<string, unknown> | null;
};

type DeptOpt = { id: number; name: string; departmentCode: string; status: string };
type EmpOpt = {
  id: number;
  fullName: string;
  employeeCode: string;
  position?: string | null;
  status: string;
};

type FormState = {
  name: string;
  managerEmployeeId: string;
  deputyEmployeeId: string;
  parentDepartmentId: string;
  headcountTarget: string;
  location: string;
  contactEmail: string;
  description: string;
  category: string;
  updateReason: string;
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
  if (!Number.isNaN(d.getTime()) && String(iso).includes('T')) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const [y, m, day] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    DEPARTMENT_CREATE: 'Khởi tạo phòng ban',
    DEPARTMENT_UPDATE: 'Cập nhật thông tin',
    DEPARTMENT_STATUS_CHANGE: 'Đổi trạng thái',
    DEPARTMENT_MANAGER_CHANGE: 'Bổ nhiệm / đổi trưởng phòng',
    DEPARTMENT_QUOTA_CHANGE: 'Điều chỉnh định biên',
    DEPARTMENT_RECRUITMENT_TOGGLE: 'Bật/tắt tuyển dụng',
  };
  return map[action] || action;
}

function toForm(d: Detail): FormState {
  return {
    name: d.name || '',
    managerEmployeeId:
      d.managerEmployeeId != null ? String(d.managerEmployeeId) : '',
    deputyEmployeeId:
      d.deputyEmployeeId != null ? String(d.deputyEmployeeId) : '',
    parentDepartmentId:
      d.parentDepartmentId != null ? String(d.parentDepartmentId) : '',
    headcountTarget:
      d.headcountTarget != null ? String(d.headcountTarget) : '',
    location: d.location || '',
    contactEmail: d.contactEmail || '',
    description: d.description || '',
    category: d.category || '',
    updateReason: '',
  };
}

export default function DepartmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAdmin = user?.role === 'ADMIN';

  const [tab, setTab] = useState<'structure' | 'members' | 'audit'>('structure');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [depts, setDepts] = useState<DeptOpt[]>([]);
  const [emps, setEmps] = useState<EmpOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pickMgr, setPickMgr] = useState(false);
  const [pickDep, setPickDep] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.get<Detail>(`/departments/${id}`),
        api.get<AuditRow[]>(`/departments/${id}/audit`, {
          params: { limit: 40 },
        }),
      ]);
      setDetail(d.data);
      setForm(toForm(d.data));
      setAudit(a.data);
      setError('');
    } catch {
      setError('Không tải được chi tiết phòng ban');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    api
      .get('/departments')
      .then((r) => setDepts(r.data))
      .catch(() => undefined);
    if (canAdmin) {
      api
        .get('/employees/options')
        .then((r) =>
          setEmps((r.data as EmpOpt[]).filter((e) => e.status === 'ACTIVE')),
        )
        .catch(() => undefined);
    }
  }, [load, canAdmin]);

  const dirty = useMemo(() => {
    if (!detail || !form) return false;
    const base = toForm(detail);
    const { updateReason: _r1, ...a } = base;
    const { updateReason: _r2, ...b } = form;
    void _r1;
    void _r2;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [detail, form]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function resetForm() {
    if (detail) setForm(toForm(detail));
    setPickMgr(false);
    setPickDep(false);
  }

  async function save() {
    if (!detail || !form || !canAdmin) return;
    if (!form.name.trim()) {
      setError('Tên phòng ban là bắt buộc');
      return;
    }
    if (dirty && form.updateReason.trim().length < 5) {
      setError('Vui lòng nhập lý do cập nhật (tối thiểu 5 ký tự)');
      setTab('structure');
      return;
    }
    if (
      form.managerEmployeeId &&
      form.deputyEmployeeId &&
      form.managerEmployeeId === form.deputyEmployeeId
    ) {
      setError('Phó phòng không được trùng người phụ trách');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/departments/${detail.id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        managerEmployeeId: form.managerEmployeeId
          ? Number(form.managerEmployeeId)
          : null,
        deputyEmployeeId: form.deputyEmployeeId
          ? Number(form.deputyEmployeeId)
          : null,
        parentDepartmentId: form.parentDepartmentId
          ? Number(form.parentDepartmentId)
          : null,
        headcountTarget: form.headcountTarget
          ? Number(form.headcountTarget)
          : null,
        location: form.location.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        category: form.category || null,
        updateReason: form.updateReason.trim() || undefined,
      });
      setOkMsg('Đã cập nhật phòng ban');
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
      setPickMgr(false);
      setPickDep(false);
      await load();
    } catch {
      setError('Cập nhật phòng ban thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRecruitment() {
    if (!detail || !canAdmin) return;
    const next = !detail.recruitmentPaused;
    if (
      !window.confirm(
        next
          ? 'Tạm ngừng tuyển dụng mới cho phòng ban này?'
          : 'Mở lại tuyển dụng cho phòng ban này?',
      )
    )
      return;
    try {
      await api.patch(`/departments/${detail.id}`, {
        recruitmentPaused: next,
        updateReason: next
          ? 'Tạm ngừng tuyển dụng mới'
          : 'Mở lại tuyển dụng',
      });
      await load();
    } catch {
      setError('Đổi trạng thái tuyển dụng thất bại');
    }
  }

  async function setInactive() {
    if (!detail || !canAdmin) return;
    if (!window.confirm('Chuyển phòng ban sang INACTIVE (tạm dừng)?')) return;
    try {
      await api.patch(`/departments/${detail.id}`, {
        status: 'INACTIVE',
        updateReason: 'Tạm dừng hoạt động khối',
      });
      await load();
    } catch {
      setError('Đổi trạng thái thất bại');
    }
  }

  async function setActive() {
    if (!detail || !canAdmin) return;
    try {
      await api.patch(`/departments/${detail.id}`, {
        status: 'ACTIVE',
        updateReason: 'Kích hoạt lại phòng ban',
      });
      await load();
    } catch {
      setError('Kích hoạt thất bại');
    }
  }

  const mgr =
    emps.find((e) => String(e.id) === form?.managerEmployeeId) ||
    detail?.manager;
  const dep =
    emps.find((e) => String(e.id) === form?.deputyEmployeeId) ||
    detail?.deputy;

  const fillPct = detail?.fillPct ?? 0;
  const barPct = Math.min(100, Math.max(0, fillPct));

  if (loading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (!detail || !form) {
    return (
      <div>
        <Alert variant="danger">{error || 'Không tìm thấy phòng ban'}</Alert>
        <Link to="/departments">← Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <div className="nx-dd">
      <div className="nx-dd-top">
        <Link to="/departments" className="nx-dd-back">
          ← Quay lại danh sách
        </Link>
        <nav className="nx-dd-crumb">
          <span>Quản trị hệ thống</span>
          <span className="sep">›</span>
          <Link to="/departments">Quản lý phòng ban</Link>
          <span className="sep">›</span>
          <span className="here">Chi tiết: {detail.name}</span>
        </nav>
        <h1>Chi Tiết &amp; Cập Nhật Phòng Ban</h1>

        <div className="nx-dd-tabs">
          <button
            type="button"
            className={`nx-dd-tab${tab === 'structure' ? ' active' : ''}`}
            onClick={() => setTab('structure')}
          >
            Thông tin cơ cấu &amp; Định biên
          </button>
          <button
            type="button"
            className={`nx-dd-tab${tab === 'members' ? ' active' : ''}`}
            onClick={() => setTab('members')}
          >
            Danh sách nhân sự ({detail.members.length})
          </button>
          <button
            type="button"
            className={`nx-dd-tab${tab === 'audit' ? ' active' : ''}`}
            onClick={() => setTab('audit')}
          >
            Lịch sử Audit Trail
          </button>
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

      <div className="nx-dd-layout">
        <aside className="nx-dd-side">
          <div className="nx-dd-card nx-dd-hero">
            <div className="nx-dd-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20V8l8-4 8 4v12" />
                <path d="M9 20v-6h6v6" />
              </svg>
            </div>
            <h2>{detail.name}</h2>
            <div className="parent">
              {detail.parent
                ? detail.parent.name
                : 'Cấp gốc — Nexora Group'}
            </div>
            <div className="nx-dd-meta">
              <div>
                <span>Mã định danh ban</span>
                {detail.departmentCode}
              </div>
              <div>
                <span>Ngày thành lập</span>
                {fmtDate(detail.foundedAt)}
                {detail.yearsActive ? ` · ${detail.yearsActive}` : ''}
              </div>
              <div>
                <span>Email nhóm</span>
                {detail.contactEmail || '—'}
              </div>
              <div>
                <span>Địa điểm</span>
                {detail.location || '—'}
              </div>
              <div>
                <span>Trạng thái</span>
                <span
                  className={`nx-dd-st ${
                    detail.status === 'ACTIVE'
                      ? 'on'
                      : detail.status === 'DRAFT'
                        ? 'draft'
                        : 'off'
                  }`}
                  style={{ display: 'inline-flex', marginTop: 4 }}
                >
                  {detail.status}
                </span>
                {detail.recruitmentPaused && (
                  <div className="nx-dd-hint" style={{ color: '#c62828' }}>
                    Đang tạm ngừng tuyển dụng mới
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="nx-dd-card">
            <h3>Chỉ số vận hành · {detail.metrics.label}</h3>
            <div className="nx-dd-kpi">
              <div>
                <div className="row">
                  <span>Định biên</span>
                  <strong>
                    {detail.headcount}
                    {detail.headcountTarget != null
                      ? ` / ${detail.headcountTarget}`
                      : ''}
                  </strong>
                </div>
                <div className="sub">
                  {detail.fillPct != null
                    ? `${detail.fillPct}% · còn ${detail.slotsLeft ?? 0} slot`
                    : 'Chưa cấu hình mục tiêu'}
                </div>
                <div className="nx-dd-bar">
                  <i style={{ width: `${barPct}%` }} />
                </div>
              </div>
              <div>
                <div className="row">
                  <span>Công việc đang mở</span>
                  <strong>{detail.metrics.taskActive}</strong>
                </div>
                <div className="sub">
                  {detail.metrics.taskOnTimePct != null
                    ? `${detail.metrics.taskOnTimePct}% đúng hạn (đã hoàn thành)`
                    : 'Chưa có task hoàn thành có hạn'}
                </div>
              </div>
              <div>
                <div className="row">
                  <span>Chấm công đúng giờ</span>
                  <strong>
                    {detail.metrics.attendancePct != null
                      ? `${detail.metrics.attendancePct}%`
                      : '—'}
                  </strong>
                </div>
                <div className="sub">
                  {detail.metrics.attendanceDelta != null
                    ? `${detail.metrics.attendanceDelta >= 0 ? '+' : ''}${detail.metrics.attendanceDelta}% so với tháng trước`
                    : 'Chưa đủ dữ liệu tháng trước'}
                </div>
              </div>
            </div>
          </div>

          {canAdmin && (
            <div className="nx-dd-card nx-dd-side-actions">
              <button
                type="button"
                className="nx-btn-outline"
                onClick={() => void toggleRecruitment()}
              >
                {detail.recruitmentPaused
                  ? 'Mở lại tuyển dụng'
                  : 'Tạm ngừng tuyển dụng mới'}
              </button>
              {detail.status === 'INACTIVE' ? (
                <button
                  type="button"
                  className="nx-btn-primary"
                  onClick={() => void setActive()}
                >
                  Kích hoạt lại (ACTIVE)
                </button>
              ) : (
                <button
                  type="button"
                  className="nx-dd-danger"
                  onClick={() => void setInactive()}
                >
                  Chuyển sang INACTIVE (Tạm dừng)
                </button>
              )}
            </div>
          )}
        </aside>

        <div className="nx-dd-main">
          {tab === 'structure' && (
            <>
              <div className="nx-dd-card">
                <h2>01 · Cơ cấu tổ chức &amp; người phụ trách</h2>

                <div className="nx-dd-field">
                  <label>
                    Tên phòng ban {canAdmin && <span className="req">*</span>}
                  </label>
                  <input
                    value={form.name}
                    disabled={!canAdmin}
                    onChange={(e) => setField('name', e.target.value)}
                  />
                </div>

                <div className="nx-dd-field">
                  <label>Khối cấp trên</label>
                  <select
                    value={form.parentDepartmentId}
                    disabled={!canAdmin}
                    onChange={(e) =>
                      setField('parentDepartmentId', e.target.value)
                    }
                  >
                    <option value="">— Cấp gốc —</option>
                    {depts
                      .filter((d) => d.id !== detail.id && d.status !== 'INACTIVE')
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.departmentCode})
                        </option>
                      ))}
                  </select>
                </div>

                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  Người phụ trách chính
                </label>
                <div className="nx-dd-person">
                  <div className="who">
                    <div className="nx-dd-av">
                      {initials(mgr?.fullName || '?')}
                    </div>
                    <div>
                      <strong>{mgr?.fullName || 'Chưa gán'}</strong>
                      <div className="meta">
                        {mgr
                          ? `${mgr.employeeCode}${mgr.position ? ` · ${mgr.position}` : ''}`
                          : '—'}
                      </div>
                    </div>
                  </div>
                  {canAdmin && (
                    <button
                      type="button"
                      className="nx-btn-outline"
                      onClick={() => setPickMgr((v) => !v)}
                    >
                      {pickMgr ? 'Đóng' : 'Đổi trưởng phòng'}
                    </button>
                  )}
                </div>
                {pickMgr && (
                  <div className="nx-dd-field">
                    <select
                      value={form.managerEmployeeId}
                      onChange={(e) =>
                        setField('managerEmployeeId', e.target.value)
                      }
                    >
                      <option value="">— Bỏ gán —</option>
                      {emps.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.fullName} ({e.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  Phó phòng / Quản lý phụ trách
                </label>
                <div className="nx-dd-person">
                  <div className="who">
                    <div className="nx-dd-av">
                      {initials(dep?.fullName || '?')}
                    </div>
                    <div>
                      <strong>{dep?.fullName || 'Chưa gán'}</strong>
                      <div className="meta">
                        {dep
                          ? `${dep.employeeCode}${dep.position ? ` · ${dep.position}` : ''}`
                          : '—'}
                      </div>
                    </div>
                  </div>
                  {canAdmin && (
                    <button
                      type="button"
                      className="nx-btn-outline"
                      onClick={() => setPickDep((v) => !v)}
                    >
                      {pickDep ? 'Đóng' : dep ? 'Đổi phó phòng' : 'Thêm phó phòng'}
                    </button>
                  )}
                </div>
                {pickDep && (
                  <div className="nx-dd-field">
                    <select
                      value={form.deputyEmployeeId}
                      onChange={(e) =>
                        setField('deputyEmployeeId', e.target.value)
                      }
                    >
                      <option value="">— Không có —</option>
                      {emps
                        .filter((e) => String(e.id) !== form.managerEmployeeId)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.fullName} ({e.employeeCode})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="nx-dd-field">
                  <label>Hạn mức định biên</label>
                  <input
                    type="number"
                    min={0}
                    value={form.headcountTarget}
                    disabled={!canAdmin}
                    onChange={(e) =>
                      setField('headcountTarget', e.target.value)
                    }
                  />
                  <div className="nx-dd-hint">
                    Hiện tại {detail.headcount} NS đang hoạt động
                    {detail.fillPct != null ? ` (${detail.fillPct}%)` : ''}.
                  </div>
                  <div className="nx-dd-bar">
                    <i style={{ width: `${barPct}%` }} />
                  </div>
                </div>

                <div className="nx-dd-field">
                  <label>Email liên hệ</label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    disabled={!canAdmin}
                    onChange={(e) => setField('contactEmail', e.target.value)}
                  />
                </div>

                <div className="nx-dd-field">
                  <label>Địa điểm</label>
                  <input
                    value={form.location}
                    disabled={!canAdmin}
                    onChange={(e) => setField('location', e.target.value)}
                  />
                </div>

                <div className="nx-dd-field">
                  <label>Mô tả</label>
                  <textarea
                    value={form.description}
                    disabled={!canAdmin}
                    onChange={(e) => setField('description', e.target.value)}
                  />
                </div>

                <div className="nx-dd-field">
                  <label>Nhóm khối</label>
                  <select
                    value={form.category}
                    disabled={!canAdmin}
                    onChange={(e) => setField('category', e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="ENGINEERING">Kỹ thuật &amp; R&amp;D</option>
                    <option value="BUSINESS">Kinh doanh</option>
                    <option value="SUPPORT">Hỗ trợ &amp; Vận hành</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
              </div>

              {canAdmin && (
                <div className="nx-dd-card">
                  <h2>
                    02 · Lý do cập nhật thông tin{' '}
                    {dirty && <span className="req">*</span>}
                  </h2>
                  <div className="nx-dd-field">
                    <textarea
                      value={form.updateReason}
                      onChange={(e) =>
                        setField('updateReason', e.target.value)
                      }
                      placeholder="Ghi rõ lý do thay đổi (bắt buộc khi lưu chỉnh sửa)…"
                    />
                    <div className="nx-dd-hint">
                      Lý do được lưu vào nhật ký Audit Trail của phòng ban.
                    </div>
                  </div>
                </div>
              )}

              <div className="nx-dd-card">
                <h2>03 · Thay đổi cơ cấu gần đây</h2>
                {audit.length === 0 ? (
                  <div className="nx-dd-hint">Chưa có nhật ký</div>
                ) : (
                  <ul className="nx-dd-audit">
                    {audit.slice(0, 8).map((a) => (
                      <li key={a.id}>
                        <i className="dot" />
                        <div>
                          <strong>{actionLabel(a.action)}</strong>
                          <div className="meta">
                            {a.actorUsername} · {fmtDate(a.createdAt)}
                            {a.metadata?.updateReason
                              ? ` · ${String(a.metadata.updateReason)}`
                              : ''}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === 'members' && (
            <div className="nx-dd-card">
              <h2>Danh sách nhân sự thuộc phòng ban</h2>
              <table className="nx-dd-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Họ tên</th>
                    <th>Chức vụ</th>
                    <th>Email</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.members.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: '#7a8a85' }}>
                        Chưa có nhân sự
                      </td>
                    </tr>
                  )}
                  {detail.members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/employees/${m.id}`}>{m.employeeCode}</Link>
                      </td>
                      <td>{m.fullName}</td>
                      <td>{m.position || '—'}</td>
                      <td>{m.email}</td>
                      <td>
                        <span
                          className={`nx-dd-st ${m.status === 'ACTIVE' ? 'on' : 'off'}`}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'audit' && (
            <div className="nx-dd-card">
              <h2>Lịch sử Audit Trail</h2>
              {audit.length === 0 ? (
                <div className="nx-dd-hint">Chưa có nhật ký</div>
              ) : (
                <ul className="nx-dd-audit">
                  {audit.map((a) => (
                    <li key={a.id}>
                      <i className="dot" />
                      <div>
                        <strong>{actionLabel(a.action)}</strong>
                        <div className="meta">
                          {a.actorUsername} · {fmtDate(a.createdAt)}
                        </div>
                        {a.metadata?.updateReason != null && (
                          <div className="meta">
                            Lý do: {String(a.metadata.updateReason)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {canAdmin && (
        <div className="nx-dd-foot">
          <div className="info">
            {savedAt
              ? `Đã lưu lúc ${savedAt}`
              : dirty
                ? 'Có thay đổi chưa lưu'
                : 'Không có thay đổi'}
            {' · '}
            Phiên: {user?.username} ({user?.role})
          </div>
          <button type="button" className="ghost" onClick={resetForm}>
            Hủy thay đổi
          </button>
          <button
            type="button"
            className="nx-btn-outline"
            onClick={() => navigate('/departments')}
          >
            Quay lại
          </button>
          <button
            type="button"
            className="nx-btn-primary"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? 'Đang lưu…' : 'Cập nhật phòng ban'}
          </button>
        </div>
      )}
    </div>
  );
}
