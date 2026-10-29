import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import '../styles/employee-create.css';

type Dept = { id: number; name: string; status?: string };
type EmpOpt = {
  id: number;
  fullName: string;
  employeeCode: string;
  position?: string;
  status: string;
};

const DRAFT_KEY = 'nexora-employee-create-draft';

type FormState = {
  employeeCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  nationalId: string;
  email: string;
  phone: string;
  permanentAddress: string;
  temporaryAddress: string;
  sameAddress: boolean;
  departmentId: string;
  position: string;
  hireDate: string;
  managerEmployeeId: string;
  contractType: string;
};

const emptyForm: FormState = {
  employeeCode: '',
  fullName: '',
  dateOfBirth: '',
  gender: 'MALE',
  nationalId: '',
  email: '',
  phone: '',
  permanentAddress: '',
  temporaryAddress: '',
  sameAddress: false,
  departmentId: '',
  position: '',
  hireDate: '',
  managerEmployeeId: '',
  contractType: 'OFFICIAL',
};

function nationalIdOk(v: string) {
  return /^[0-9A-Za-z]{8,20}$/.test(v.trim());
}

export default function EmployeeCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [managers, setManagers] = useState<EmpOpt[]>([]);
  const [totalStaff, setTotalStaff] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'permanentAddress' && prev.sameAddress) {
        next.temporaryAddress = String(value);
      }
      if (key === 'sameAddress' && value === true) {
        next.temporaryAddress = prev.permanentAddress;
      }
      return next;
    });
  };

  async function loadNextCode() {
    const { data } = await api.get('/employees/next-code');
    setForm((prev) => ({ ...prev, employeeCode: data.employeeCode }));
  }

  useEffect(() => {
    void api
      .get('/employees/stats')
      .then((r) => setTotalStaff(r.data.total))
      .catch(() => undefined);
    void api
      .get('/departments')
      .then((r) => setDepts(r.data))
      .catch(() => undefined);
    void api
      .get('/employees/options')
      .then((r) =>
        setManagers(
          (r.data as EmpOpt[]).filter((e) => e.status === 'ACTIVE'),
        ),
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
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const activeDepts = useMemo(
    () => depts.filter((d) => !d.status || d.status === 'ACTIVE'),
    [depts],
  );

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!form.employeeCode.trim()) list.push('Thiếu mã nhân sự');
    if (!form.fullName.trim()) list.push('Thiếu họ tên');
    if (!form.email.trim()) list.push('Thiếu email công vụ');
    if (!form.phone.trim()) list.push('Thiếu số điện thoại');
    if (!form.departmentId) list.push('Chưa chọn phòng ban');
    if (!form.position.trim()) list.push('Thiếu chức vụ');
    if (!form.hireDate) list.push('Thiếu ngày bắt đầu');
    if (!form.contractType) list.push('Chưa chọn loại HĐLĐ');
    if (form.nationalId && !nationalIdOk(form.nationalId)) {
      list.push('CCCD/Hộ chiếu không hợp lệ (8–20 ký tự)');
    }
    if (photoFile && photoFile.size > 5 * 1024 * 1024) {
      list.push('Ảnh vượt quá 5MB');
    }
    return list;
  }, [form, photoFile]);

  const valid = errors.length === 0;

  function onPickPhoto(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Ảnh phải là JPG/PNG/WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh phải nhỏ hơn 5MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setMsg('Đã lưu bản nháp trên máy này');
    window.setTimeout(() => setMsg(''), 2200);
  }

  async function onSubmit() {
    if (!valid) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        employeeCode: form.employeeCode.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        departmentId: Number(form.departmentId),
        position: form.position.trim(),
        hireDate: form.hireDate,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        nationalId: form.nationalId.trim() || undefined,
        permanentAddress: form.permanentAddress.trim() || undefined,
        temporaryAddress: (
          form.sameAddress ? form.permanentAddress : form.temporaryAddress
        ).trim() || undefined,
        managerEmployeeId: form.managerEmployeeId
          ? Number(form.managerEmployeeId)
          : undefined,
        contractType: form.contractType,
      };
      const { data } = await api.post('/employees', payload);
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        await api.post(`/employees/${data.id}/photo`, fd);
      }
      localStorage.removeItem(DRAFT_KEY);
      navigate('/employees');
    } catch {
      setError('Tạo hồ sơ thất bại — kiểm tra mã NV / CCCD trùng hoặc dữ liệu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="nx-ec">
      <div className="nx-ec-top">
        <div>
          <nav className="nx-ec-crumb">
            <span>Quản trị hệ thống</span>
            <span className="sep">›</span>
            <Link to="/employees">Quản lý nhân sự</Link>
            <span className="sep">›</span>
            <span className="here">Thêm nhân viên mới</span>
          </nav>
          <h1>Khởi Tạo Hồ Sơ Nhân Viên Mới</h1>
        </div>
        <div className="nx-ec-cap">Tổng nhân sự hiện tại: {totalStaff}</div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {msg && <Alert variant="success">{msg}</Alert>}

      <div className="nx-ec-grid">
        <section className="nx-ec-card">
          <h2>Thông tin cá nhân &amp; định danh</h2>

          <div className="nx-ec-photo">
            <div className="nx-ec-photo-preview">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" />
              ) : (
                'Ảnh'
              )}
            </div>
            <div className="nx-ec-photo-meta">
              Ảnh chân dung JPG/PNG/WEBP, tối đa 5MB (tuỳ chọn).
              <div className="nx-ec-photo-actions">
                <label className="nx-btn-outline" style={{ cursor: 'pointer' }}>
                  Tải ảnh lên
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) =>
                      onPickPhoto(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="nx-btn-outline"
                  onClick={() => onPickPhoto(null)}
                >
                  Xóa ảnh
                </button>
              </div>
            </div>
          </div>

          <div className="nx-ec-field">
            <label>
              Mã nhân sự <span className="req">*</span>
            </label>
            <div className="nx-ec-code-row">
              <input
                value={form.employeeCode}
                onChange={(e) => setField('employeeCode', e.target.value)}
              />
              <button
                type="button"
                className="nx-btn-outline"
                onClick={() => void loadNextCode()}
              >
                Sinh lại
              </button>
            </div>
          </div>

          <div className="nx-ec-field">
            <label>
              Họ và tên đầy đủ <span className="req">*</span>
            </label>
            <input
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
            />
          </div>

          <div className="nx-ec-row2">
            <div className="nx-ec-field">
              <label>Ngày sinh</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
              />
            </div>
            <div className="nx-ec-field">
              <label>Giới tính</label>
              <select
                value={form.gender}
                onChange={(e) => setField('gender', e.target.value)}
              >
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
          </div>

          <div className="nx-ec-field nx-ec-nid">
            <label>Số CCCD / Hộ chiếu</label>
            <input
              value={form.nationalId}
              onChange={(e) => setField('nationalId', e.target.value)}
              placeholder="8–20 ký tự"
            />
            {form.nationalId && nationalIdOk(form.nationalId) && (
              <span className="ok">Hợp lệ</span>
            )}
          </div>

          <div className="nx-ec-row2">
            <div className="nx-ec-field">
              <label>
                Email công vụ <span className="req">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
            <div className="nx-ec-field">
              <label>
                Số điện thoại <span className="req">*</span>
              </label>
              <input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
          </div>

          <div className="nx-ec-field">
            <label>Địa chỉ thường trú</label>
            <textarea
              value={form.permanentAddress}
              onChange={(e) => setField('permanentAddress', e.target.value)}
            />
          </div>

          <label className="nx-ec-check">
            <input
              type="checkbox"
              checked={form.sameAddress}
              onChange={(e) => setField('sameAddress', e.target.checked)}
            />
            Giống địa chỉ thường trú
          </label>

          <div className="nx-ec-field">
            <label>Địa chỉ tạm trú</label>
            <textarea
              value={form.temporaryAddress}
              disabled={form.sameAddress}
              onChange={(e) => setField('temporaryAddress', e.target.value)}
            />
          </div>
        </section>

        <section className="nx-ec-card">
          <h2>Thông tin công việc &amp; tổ chức</h2>

          <div className="nx-ec-field">
            <label>
              Phòng ban trực thuộc <span className="req">*</span>
            </label>
            <select
              value={form.departmentId}
              onChange={(e) => setField('departmentId', e.target.value)}
            >
              <option value="">— Chọn phòng ban —</option>
              {activeDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="nx-ec-hint">
              {activeDepts.length} phòng ban đang hoạt động
            </div>
          </div>

          <div className="nx-ec-field">
            <label>
              Chức vụ / vị trí <span className="req">*</span>
            </label>
            <input
              value={form.position}
              onChange={(e) => setField('position', e.target.value)}
            />
          </div>

          <div className="nx-ec-field">
            <label>
              Ngày bắt đầu làm việc <span className="req">*</span>
            </label>
            <input
              type="date"
              value={form.hireDate}
              onChange={(e) => setField('hireDate', e.target.value)}
            />
          </div>

          <div className="nx-ec-field">
            <label>Người quản lý trực tiếp</label>
            <select
              value={form.managerEmployeeId}
              onChange={(e) => setField('managerEmployeeId', e.target.value)}
            >
              <option value="">— Chưa gán —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                  {m.position ? ` (${m.position})` : ''} — {m.employeeCode}
                </option>
              ))}
            </select>
          </div>

          <div className="nx-ec-field">
            <label>
              Loại hợp đồng lao động <span className="req">*</span>
            </label>
            <div className="nx-ec-contracts">
              {(
                [
                  ['PROBATION', 'Thử việc', 'Thường 2 tháng'],
                  ['OFFICIAL', 'Chính thức', 'Có thời hạn'],
                  ['INDEFINITE', 'Vô thời hạn', 'HĐLĐ không kỳ hạn'],
                  ['INTERN', 'Thực tập', 'Sinh viên / trainee'],
                ] as const
              ).map(([val, title, sub]) => (
                <label
                  key={val}
                  className={`nx-ec-contract ${form.contractType === val ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="contract"
                    checked={form.contractType === val}
                    onChange={() => setField('contractType', val)}
                  />
                  <strong>{title}</strong>
                  <span>{sub}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="nx-ec-foot">
        <div className={`nx-ec-foot-msg ${valid ? 'ok' : 'bad'}`}>
          {valid
            ? 'Dữ liệu biểu mẫu đã kiểm tra hợp lệ — 0 lỗi'
            : `Còn ${errors.length} lỗi: ${errors[0]}`}
        </div>
        <button type="button" className="ghost" onClick={() => navigate('/employees')}>
          Hủy bỏ quay lại
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
          {saving ? 'Đang tạo…' : 'Xác nhận tạo hồ sơ nhân viên (AD-07)'}
        </button>
      </div>
    </div>
  );
}
