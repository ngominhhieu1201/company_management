import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/department-create.css';

type DeptOpt = {
  id: number;
  departmentCode: string;
  name: string;
  status: string;
};

type EmpOpt = {
  id: number;
  fullName: string;
  employeeCode: string;
  position?: string | null;
  status: string;
  departmentId?: number | null;
};

type CodeCheck = {
  code: string;
  valid: boolean;
  available: boolean;
  message: string;
};

const DRAFT_KEY = 'nexora-department-create-draft';

const LOCATION_PRESETS = [
  'Tầng 12 – Tòa nhà Central Hub',
  'Tầng 14 - Tòa nhà Central Hub (Trụ sở chính Hà Nội)',
  'Tầng 5 – Tòa nhà Central Hub',
  'Văn phòng chi nhánh HCM',
];

type FormState = {
  departmentCode: string;
  name: string;
  parentDepartmentId: string;
  location: string;
  description: string;
  managerEmployeeId: string;
  deputyEmployeeId: string;
  headcountTarget: string;
  contactEmail: string;
  category: string;
  status: 'ACTIVE' | 'DRAFT';
};

const emptyForm: FormState = {
  departmentCode: '',
  name: '',
  parentDepartmentId: '',
  location: LOCATION_PRESETS[0],
  description: '',
  managerEmployeeId: '',
  deputyEmployeeId: '',
  headcountTarget: '10',
  contactEmail: '',
  category: '',
  status: 'ACTIVE',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function nowStamp() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} - ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function DepartmentCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      navigate('/departments', { replace: true });
    }
  }, [user, navigate]);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [depts, setDepts] = useState<DeptOpt[]>([]);
  const [emps, setEmps] = useState<EmpOpt[]>([]);
  const [codeCheck, setCodeCheck] = useState<CodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [stamp] = useState(() => nowStamp());

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function loadNextCode() {
    const { data } = await api.get<{ departmentCode: string }>(
      '/departments/next-code',
    );
    setField('departmentCode', data.departmentCode);
  }

  useEffect(() => {
    void api
      .get('/departments')
      .then((r) => setDepts(r.data as DeptOpt[]))
      .catch(() => undefined);
    void api
      .get('/employees/options')
      .then((r) =>
        setEmps((r.data as EmpOpt[]).filter((e) => e.status === 'ACTIVE')),
      )
      .catch(() => undefined);

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as FormState;
        setForm({ ...emptyForm, ...draft });
      } else {
        void loadNextCode().catch(() => undefined);
      }
    } catch {
      void loadNextCode().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const code = form.departmentCode.trim().toUpperCase();
    if (code.length < 4) {
      setCodeCheck(null);
      return;
    }
    const t = setTimeout(() => {
      setChecking(true);
      api
        .get<CodeCheck>('/departments/check-code', { params: { code } })
        .then((r) => setCodeCheck(r.data))
        .catch(() => setCodeCheck(null))
        .finally(() => setChecking(false));
    }, 350);
    return () => clearTimeout(t);
  }, [form.departmentCode]);

  const manager = useMemo(
    () => emps.find((e) => String(e.id) === form.managerEmployeeId) || null,
    [emps, form.managerEmployeeId],
  );

  const parent = useMemo(
    () =>
      depts.find((d) => String(d.id) === form.parentDepartmentId) || null,
    [depts, form.parentDepartmentId],
  );

  const nameLen = form.name.length;
  const descLen = form.description.length;

  const canSubmit =
    form.departmentCode.trim().length >= 4 &&
    form.name.trim().length >= 2 &&
    codeCheck?.available === true &&
    !saving;

  function saveLocalDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setMsg('Đã lưu nháp trên trình duyệt');
    setTimeout(() => setMsg(''), 2500);
  }

  async function submit(status: 'ACTIVE' | 'DRAFT') {
    if (!codeCheck?.available) {
      setError('Mã phòng ban chưa hợp lệ hoặc đã tồn tại');
      return;
    }
    if (form.name.trim().length < 2) {
      setError('Tên phòng ban là bắt buộc');
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
      await api.post('/departments', {
        departmentCode: form.departmentCode.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        parentDepartmentId: form.parentDepartmentId
          ? Number(form.parentDepartmentId)
          : undefined,
        location: form.location.trim() || undefined,
        managerEmployeeId: form.managerEmployeeId
          ? Number(form.managerEmployeeId)
          : undefined,
        deputyEmployeeId: form.deputyEmployeeId
          ? Number(form.deputyEmployeeId)
          : undefined,
        headcountTarget: form.headcountTarget
          ? Number(form.headcountTarget)
          : undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        category: form.category || undefined,
        status,
      });
      localStorage.removeItem(DRAFT_KEY);
      navigate('/departments');
    } catch {
      setError(
        status === 'DRAFT'
          ? 'Lưu bản nháp thất bại'
          : 'Tạo phòng ban thất bại — kiểm tra mã / dữ liệu',
      );
    } finally {
      setSaving(false);
    }
  }

  const hc = Number(form.headcountTarget) || 0;

  return (
    <div className="nx-dc">
      <div className="nx-dc-top">
        <nav className="nx-dc-crumb">
          <span>Quản trị hệ thống</span>
          <span className="sep">›</span>
          <Link to="/departments">Quản lý phòng ban</Link>
          <span className="sep">›</span>
          <span className="here">Thêm phòng ban mới</span>
        </nav>
        <h1>Khởi tạo Phòng Ban &amp; Khối Nghiệp Vụ Mới</h1>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {msg && <Alert variant="success">{msg}</Alert>}

      <div className="nx-dc-grid">
        <section className="nx-dc-card">
          <h2>
            <span className="num">01</span>
            Thông Tin Định Danh &amp; Cơ Cấu Tổ Chức
          </h2>

          <div className="nx-dc-field">
            <label>
              Mã phòng ban <span className="req">*</span>
            </label>
            <div className="nx-dc-code-row">
              <input
                value={form.departmentCode}
                onChange={(e) =>
                  setField('departmentCode', e.target.value.toUpperCase())
                }
                placeholder="PB-DATA"
                maxLength={12}
              />
              <button
                type="button"
                className="nx-btn-outline"
                onClick={() => void loadNextCode()}
              >
                Tạo mã tự động
              </button>
            </div>
            <div className="nx-dc-code-meta">
              {checking && <span className="nx-dc-badge wait">Đang kiểm tra…</span>}
              {!checking && codeCheck && (
                <span
                  className={`nx-dc-badge ${codeCheck.available ? 'ok' : 'bad'}`}
                >
                  {codeCheck.message}
                </span>
              )}
            </div>
            <div className="nx-dc-hint">
              Định dạng PB-XXXX (2–8 ký tự chữ/số sau tiền tố PB-).
            </div>
          </div>

          <div className="nx-dc-field">
            <label>
              Tên phòng ban / Khối nghiệp vụ <span className="req">*</span>
            </label>
            <input
              value={form.name}
              maxLength={128}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="VD: Khối Dữ Liệu & Trí Tuệ Nhân Tạo"
            />
            <div className="nx-dc-count">{nameLen}/128</div>
          </div>

          <div className="nx-dc-field">
            <label>Khối quản lý cấp trên</label>
            <select
              value={form.parentDepartmentId}
              onChange={(e) => setField('parentDepartmentId', e.target.value)}
            >
              <option value="">— Không có (cấp gốc) —</option>
              {depts
                .filter((d) => d.status !== 'INACTIVE')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.departmentCode})
                  </option>
                ))}
            </select>
            <div className="nx-dc-path">
              Nexora Group
              {parent ? (
                <>
                  {' '}
                  › <strong>{parent.name}</strong> ›{' '}
                  <strong>{form.departmentCode || '…'}</strong>
                </>
              ) : (
                <>
                  {' '}
                  › <strong>{form.departmentCode || '…'}</strong>
                </>
              )}
            </div>
          </div>

          <div className="nx-dc-field">
            <label>Vị trí làm việc / Văn phòng phụ trách</label>
            <select
              value={
                LOCATION_PRESETS.includes(form.location)
                  ? form.location
                  : '__custom__'
              }
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setField('location', '');
                } else {
                  setField('location', e.target.value);
                }
              }}
            >
              {LOCATION_PRESETS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
              <option value="__custom__">Khác (nhập tay)…</option>
            </select>
            {!LOCATION_PRESETS.includes(form.location) && (
              <input
                style={{ marginTop: '0.45rem' }}
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                placeholder="Nhập địa điểm"
              />
            )}
          </div>

          <div className="nx-dc-field">
            <label>Mô tả chức năng &amp; nhiệm vụ chuyên môn</label>
            <textarea
              value={form.description}
              maxLength={500}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Mô tả ngắn về phạm vi trách nhiệm của khối…"
            />
            <div className="nx-dc-count">{descLen}/500</div>
          </div>

          <div className="nx-dc-field">
            <label>Nhóm khối</label>
            <select
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
            >
              <option value="">— Chọn nhóm —</option>
              <option value="ENGINEERING">Kỹ thuật &amp; R&amp;D</option>
              <option value="BUSINESS">Kinh doanh</option>
              <option value="SUPPORT">Hỗ trợ &amp; Vận hành</option>
              <option value="OTHER">Khác</option>
            </select>
          </div>
        </section>

        <section className="nx-dc-card">
          <h2>
            <span className="num">02</span>
            Nhân Sự Định Biên &amp; Quản Lý
          </h2>

          <div className="nx-dc-field">
            <label>Người phụ trách / Trưởng phòng</label>
            <select
              value={form.managerEmployeeId}
              onChange={(e) => setField('managerEmployeeId', e.target.value)}
            >
              <option value="">— Chưa gán —</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode})
                </option>
              ))}
            </select>
            {manager && (
              <div className="nx-dc-mgr">
                <div className="top">
                  <div>
                    <strong>{manager.fullName}</strong>
                    <div className="meta">
                      {manager.employeeCode}
                      {manager.position ? ` · ${manager.position}` : ''}
                    </div>
                  </div>
                  <span className="nx-dc-badge ok">ACTIVE</span>
                </div>
                <div className="note">
                  Nhân sự đang hoạt động — có thể gán làm phụ trách khối.
                </div>
              </div>
            )}
          </div>

          <div className="nx-dc-field">
            <label>Phó phòng / Người ủy quyền</label>
            <select
              value={form.deputyEmployeeId}
              onChange={(e) => setField('deputyEmployeeId', e.target.value)}
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
            <div className="nx-dc-hint">
              Người này hỗ trợ KPI / nghỉ phép khi trưởng phòng vắng mặt.
            </div>
          </div>

          <div className="nx-dc-field">
            <label>Hạn mức định biên nhân sự</label>
            <div className="nx-dc-stepper">
              <button
                type="button"
                onClick={() =>
                  setField('headcountTarget', String(Math.max(0, hc - 1)))
                }
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={form.headcountTarget}
                onChange={(e) => setField('headcountTarget', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setField('headcountTarget', String(hc + 1))}
              >
                +
              </button>
            </div>
            <div className="nx-dc-info">
              Hệ thống dùng định biên để theo dõi tỷ lệ lấp đầy trên màn danh
              sách phòng ban.
            </div>
          </div>

          <div className="nx-dc-field nx-dc-email">
            <label>Email liên hệ phòng ban</label>
            <span className="at">@</span>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setField('contactEmail', e.target.value)}
              placeholder="data-ai@nexora.work"
            />
          </div>

          <div className="nx-dc-field">
            <label>Trạng thái khởi tạo</label>
            <div className="nx-dc-radios">
              <label
                className={`nx-dc-radio${form.status === 'ACTIVE' ? ' active' : ''}`}
              >
                <input
                  type="radio"
                  name="status"
                  checked={form.status === 'ACTIVE'}
                  onChange={() => setField('status', 'ACTIVE')}
                />
                <strong>ĐANG HOẠT ĐỘNG (ACTIVE)</strong>
                <span>Đưa vào vận hành ngay sau khi tạo</span>
              </label>
              <label
                className={`nx-dc-radio${form.status === 'DRAFT' ? ' active' : ''}`}
              >
                <input
                  type="radio"
                  name="status"
                  checked={form.status === 'DRAFT'}
                  onChange={() => setField('status', 'DRAFT')}
                />
                <strong>BẢN THẢO (DRAFT)</strong>
                <span>Lưu để hoàn thiện / phê duyệt nội bộ sau</span>
              </label>
            </div>
          </div>

          <div className="nx-dc-actor">
            Người tạo:{' '}
            <strong>
              {user?.username || '—'} ({user?.role || '—'})
            </strong>
            <br />
            Thời điểm soạn: {stamp}
          </div>
        </section>
      </div>

      <div className="nx-dc-foot">
        <button
          type="button"
          className="ghost"
          onClick={() => navigate('/departments')}
        >
          Hủy bỏ
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="nx-btn-outline"
          disabled={saving || !canSubmit}
          onClick={() => {
            saveLocalDraft();
            void submit('DRAFT');
          }}
        >
          Lưu nháp
        </button>
        <button
          type="button"
          className="nx-btn-primary"
          disabled={!canSubmit}
          onClick={() => void submit(form.status)}
        >
          {saving
            ? 'Đang lưu…'
            : form.status === 'DRAFT'
              ? 'Lưu bản thảo phòng ban'
              : 'Xác nhận tạo phòng ban mới'}
        </button>
      </div>
    </div>
  );
}
