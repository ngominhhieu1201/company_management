import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import {
  LEAVE_TYPE_OPTIONS,
  type LeaveDraft,
  type LeaveFormat,
  buildReasonBody,
  draftKey,
  effectiveLeaveDays,
  fmtDate as fmt,
  fmtDays,
  workDays,
} from './leaveEmployeeUtils';
import '../styles/leave.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  departmentId?: number | null;
  position?: string | null;
  status: string;
};

type DashEmp = {
  annualQuota?: number;
  annualUsed?: number;
  leaveRemaining?: number;
  employeeName?: string;
  position?: string | null;
  departmentName?: string | null;
};

function EmployeeLeaveCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const year = new Date().getFullYear();

  const [dash, setDash] = useState<DashEmp | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [leaveFormat, setLeaveFormat] = useState<LeaveFormat>('FULL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handoverId, setHandoverId] = useState('');
  const [handoverPlan, setHandoverPlan] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handoverEmp = emps.find((e) => String(e.id) === handoverId);
  const annualQuota = dash?.annualQuota ?? 12;
  const annualUsed = dash?.annualUsed ?? 0;
  const available = dash?.leaveRemaining ?? Math.max(0, annualQuota - annualUsed);
  const usagePct = annualQuota > 0 ? Math.min(100, (annualUsed / annualQuota) * 100) : 0;

  const days = useMemo(
    () => effectiveLeaveDays(startDate, endDate, leaveFormat),
    [startDate, endDate, leaveFormat],
  );
  const apiDays = useMemo(() => workDays(startDate, endDate), [startDate, endDate]);
  const afterSubmit =
    leaveType === 'ANNUAL' ? Math.max(0, available - days) : available;
  const eligible = leaveType !== 'ANNUAL' || days <= available;
  const halfDayNote =
    (leaveFormat === 'AM' || leaveFormat === 'PM') &&
    startDate &&
    endDate &&
    startDate === endDate &&
    apiDays === 1;

  useEffect(() => {
    Promise.all([
      api.get<DashEmp>('/dashboard'),
      api.get<Emp[]>('/employees/options'),
    ])
      .then(([d, opts]) => {
        setDash(d.data);
        setEmps((opts.data as Emp[]).filter((e) => e.status === 'ACTIVE'));
      })
      .catch(() => undefined);
    if (user?.employeeId) {
      api
        .get<{ managerName?: string | null }>(`/employees/${user.employeeId}`)
        .then((r) => setManagerName(r.data.managerName ?? null))
        .catch(() => undefined);
    }
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    try {
      const raw = localStorage.getItem(draftKey(user.employeeId));
      if (!raw) return;
      const d = JSON.parse(raw) as LeaveDraft;
      setLeaveType(d.leaveType || 'ANNUAL');
      setLeaveFormat(d.leaveFormat || 'FULL');
      setStartDate(d.startDate || '');
      setEndDate(d.endDate || '');
      setReason(d.reason || '');
      setHandoverId(d.handoverId || '');
      setHandoverPlan(d.handoverPlan || '');
      setAttachmentName(d.attachmentName || '');
      setAttachmentKey(d.attachmentKey || '');
    } catch {
      /* ignore */
    }
  }, [user?.employeeId]);

  useEffect(() => {
    if (leaveFormat === 'MULTI') return;
    if (startDate && !endDate) setEndDate(startDate);
    if (leaveFormat === 'AM' || leaveFormat === 'PM') {
      if (startDate) setEndDate(startDate);
    }
  }, [leaveFormat, startDate, endDate]);

  function saveDraft() {
    if (!user?.employeeId) return;
    const payload: LeaveDraft = {
      leaveType,
      leaveFormat,
      startDate,
      endDate,
      reason,
      handoverId,
      handoverPlan,
      attachmentName,
      attachmentKey,
    };
    localStorage.setItem(draftKey(user.employeeId), JSON.stringify(payload));
    setMsg('Đã lưu bản nháp trên thiết bị này');
  }

  async function submit() {
    if (!startDate || !endDate || days <= 0) {
      setError('Chọn khoảng ngày hợp lệ (tính ngày làm việc, trừ T7/CN)');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Lý do xin nghỉ cần tối thiểu 10 ký tự');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post<{ id: number }>('/leave', {
        leaveType,
        startDate,
        endDate,
        reason: buildReasonBody(reason, handoverPlan, leaveFormat),
        handoverEmployeeId: handoverId ? Number(handoverId) : undefined,
        attachmentName: attachmentName.trim() || undefined,
        attachmentKey: attachmentKey.trim() || undefined,
      });
      if (user?.employeeId) localStorage.removeItem(draftKey(user.employeeId));
      navigate(`/leave/${data.id}`);
    } catch {
      setError('Gửi đơn thất bại (kiểm tra quỹ phép hoặc thử lại)');
    } finally {
      setSaving(false);
    }
  }

  async function onDropFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const { data } = await api.post<{
        key: string;
        originalName: string;
      }>('/leave/files', fd);
      setAttachmentKey(data.key);
      setAttachmentName(data.originalName);
    } catch {
      setError('Tải tệp chứng từ thất bại (tối đa 10MB)');
    } finally {
      setUploading(false);
    }
  }

  const typeLabel =
    LEAVE_TYPE_OPTIONS.find((o) => o.value === leaveType)?.label ?? leaveType;
  const typeOptionLabel =
    leaveType === 'ANNUAL'
      ? `${typeLabel} (Hưởng 100% lương — Còn ${fmtDays(available)} ngày)`
      : typeLabel;

  return (
    <div className="nx-emp-lv-create">
      <nav className="nx-emp-lv-create-crumb" aria-label="Breadcrumb">
        <Link to="/leave">Quay lại danh sách đơn</Link>
        <span>›</span>
        <span>Quản trị cá nhân</span>
        <span>›</span>
        <span>Phân hệ Nghỉ phép</span>
        <span>›</span>
        <span className="current">Tạo đơn nghỉ phép mới</span>
      </nav>

      <header className="nx-emp-lv-create-head">
        <div>
          <h1>Tạo Đơn Nghỉ Phép Mới</h1>
          <p className="nx-emp-lv-create-sub">
            {dash?.employeeName || user?.username}
            {dash?.position ? ` · ${dash.position}` : ''}
            {dash?.departmentName ? ` · ${dash.departmentName}` : ''}
          </p>
        </div>
      </header>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {msg && (
        <Alert variant="success" dismissible onClose={() => setMsg('')}>
          {msg}
        </Alert>
      )}

      <div className="nx-emp-lv-create-layout">
        <div className="nx-emp-lv-create-main">
          <section className="nx-emp-lv-create-card">
            <div className="nx-lc-field">
              <label>Loại nghỉ phép</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {LEAVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === 'ANNUAL'
                      ? `${o.label} (Hưởng 100% lương — Còn ${fmtDays(available)} ngày)`
                      : o.label}
                  </option>
                ))}
              </select>
              {leaveType === 'ANNUAL' && (
                <p className="nx-emp-lv-create-tip">
                  Phép năm chưa dùng hết sẽ được chuyển sang kỳ tiếp theo theo quy định công ty (tối
                  đa 3 ngày).
                </p>
              )}
            </div>

            <div className="nx-lc-field">
              <label>Hình thức nghỉ</label>
              <div className="nx-emp-lv-create-segments" role="group" aria-label="Hình thức nghỉ">
                {(
                  [
                    ['FULL', 'Cả ngày', '08:30 - 17:30'],
                    ['AM', 'Buổi sáng', '08:30 - 12:00'],
                    ['PM', 'Buổi chiều', '13:30 - 17:30'],
                    ['MULTI', 'Nhiều ngày', 'Liên tiếp'],
                  ] as const
                ).map(([v, t, h]) => (
                  <button
                    key={v}
                    type="button"
                    className={leaveFormat === v ? 'active' : ''}
                    onClick={() => setLeaveFormat(v)}
                  >
                    <strong>{t}</strong>
                    <span>{h}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="nx-emp-lv-create-dates">
              <div className="nx-lc-field">
                <label>Từ ngày</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="nx-lc-field">
                <label>Đến ngày</label>
                <input
                  type="date"
                  value={endDate}
                  disabled={leaveFormat === 'AM' || leaveFormat === 'PM'}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {days > 0 && (
              <div className={`nx-emp-lv-create-days-banner${eligible ? '' : ' warn'}`}>
                <div>
                  <div className="title">Tổng số ngày nghỉ tính lương</div>
                  <div className="value">
                    <strong>{fmtDays(days)}</strong> ngày làm việc
                  </div>
                  <div className="hint">
                    Hệ thống tự loại trừ thứ Bảy, Chủ nhật và ngày lễ.
                    {halfDayNote &&
                      ' Lưu ý: API hiện ghi nhận 1.0 ngày làm việc; hình thức nửa ngày được lưu trong nội dung đơn.'}
                  </div>
                </div>
                <span className={`nx-emp-lv-create-valid${eligible ? ' ok' : ''}`}>
                  {eligible ? 'HỢP LỆ' : 'VƯỢT QUỸ'}
                </span>
              </div>
            )}

            <div className="nx-lc-field">
              <label>Lý do xin nghỉ (tối thiểu 10 ký tự)</label>
              <textarea
                rows={4}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Mô tả lý do và phạm vi công việc…"
              />
              <span className="nx-emp-lv-create-count">{reason.trim().length}/500</span>
            </div>

            <div className="nx-lc-field">
              <label>Người nhận bàn giao công việc</label>
              <select value={handoverId} onChange={(e) => setHandoverId(e.target.value)}>
                <option value="">— Chọn đồng nghiệp cùng phòng ban —</option>
                {emps
                  .filter((e) => e.id !== user?.employeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                      {e.position ? ` · ${e.position}` : ''} ({e.employeeCode})
                    </option>
                  ))}
              </select>
              {handoverEmp && dash?.departmentName && (
                <span className="nx-emp-lv-create-dept-badge">
                  CÙNG PHÒNG BAN {dash.departmentName.toUpperCase()}
                </span>
              )}
            </div>

            <div className="nx-lc-field">
              <label>Kế hoạch bàn giao công việc</label>
              <textarea
                rows={4}
                maxLength={800}
                value={handoverPlan}
                onChange={(e) => setHandoverPlan(e.target.value)}
                placeholder="Liệt kê task, PR, cuộc họp cần bàn giao…"
              />
            </div>

            <div className="nx-lc-field">
              <label>Đính kèm chứng từ (tuỳ chọn)</label>
              <div
                className="nx-lc-dropzone nx-emp-lv-create-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onDropFile(e.dataTransfer.files[0] ?? null);
                }}
              >
                <p>
                  {uploading
                    ? 'Đang tải tệp lên…'
                    : 'Kéo thả hoặc chọn tệp chứng từ'}
                </p>
                <span>Hỗ trợ PDF, PNG, JPG · tối đa 10MB</span>
                <label className="nx-lc-drop-btn">
                  Chọn tệp
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.png,.jpg,.jpeg"
                    disabled={uploading || saving}
                    onChange={(e) => {
                      void onDropFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
                {attachmentName && <div className="nx-lc-drop-name">{attachmentName}</div>}
              </div>
            </div>

            <div className="nx-emp-lv-create-foot">
              <button type="button" className="nx-emp-lv-draft" onClick={saveDraft}>
                Lưu bản nháp
              </button>
              <button
                type="button"
                className="nx-btn-primary nx-emp-lv-create-submit"
                disabled={saving || !eligible}
                onClick={() => void submit()}
              >
                {saving ? 'Đang gửi…' : 'Gửi đơn lên quản lý phê duyệt'}
              </button>
            </div>
          </section>
        </div>

        <aside className="nx-emp-lv-create-rail">
          <section className="nx-emp-lv-create-side">
            <div className="nx-emp-lv-create-side-head">
              <span>Quỹ phép cá nhân</span>
              <strong>NIÊN ĐỘ {year}</strong>
            </div>
            <div
              className="nx-emp-lv-create-ring"
              style={{ ['--pct' as string]: `${100 - usagePct}` }}
              aria-hidden
            >
              <div className="inner">
                <strong>{fmtDays(available)}</strong>
                <span>NGÀY CÒN</span>
              </div>
            </div>
            <ul className="nx-emp-lv-create-stats">
              <li>
                <span>Tỷ lệ sử dụng</span>
                <strong>{usagePct.toFixed(1)}%</strong>
              </li>
              <li>
                <span>Định mức năm</span>
                <strong>{fmtDays(annualQuota)} ngày</strong>
              </li>
              <li>
                <span>Đã tích luỹ dùng</span>
                <strong>{fmtDays(annualUsed)} ngày</strong>
              </li>
              <li>
                <span>Khả dụng hiện tại</span>
                <strong>{fmtDays(available)} ngày</strong>
              </li>
            </ul>
            {days > 0 && leaveType === 'ANNUAL' && (
              <div className="nx-emp-lv-create-proj">
                Sau khi gửi đơn này: <strong>{fmtDays(afterSubmit)} ngày</strong>
              </div>
            )}
          </section>

          <section className="nx-emp-lv-create-side">
            <div className="nx-emp-lv-create-side-head">
              <span>Quy trình phê duyệt</span>
              <span className="sla">SLA: &lt; 6 Giờ</span>
            </div>
            <ol className="nx-emp-lv-create-flow">
              <li className="done">
                <i />
                <div>
                  <strong>Nhân viên gửi đơn</strong>
                  <span>{dash?.employeeName || user?.username || 'Bạn'}</span>
                </div>
              </li>
              <li className={handoverId ? 'next' : ''}>
                <i />
                <div>
                  <strong>Đồng nghiệp xác nhận bàn giao</strong>
                  <span>
                    {handoverEmp?.fullName || 'Chọn người nhận bàn giao'}
                    <em>SLA &lt; 2h</em>
                  </span>
                </div>
              </li>
              <li>
                <i />
                <div>
                  <strong>Quản lý trực tiếp phê duyệt</strong>
                  <span>
                    {managerName || 'Quản lý phòng ban'}
                    <em>SLA &lt; 4h</em>
                  </span>
                </div>
              </li>
            </ol>
            <p className="nx-emp-lv-create-notify">
              Thông báo gửi qua email công ty và kênh Slack khi có cập nhật trạng thái.
            </p>
          </section>

          <section className="nx-emp-lv-create-side muted">
            <h3>Tóm tắt nhanh</h3>
            <div className="nx-emp-lv-create-sum-row">
              <span>Loại</span>
              <strong>{typeOptionLabel}</strong>
            </div>
            <div className="nx-emp-lv-create-sum-row">
              <span>Thời lượng</span>
              <strong>{days > 0 ? `${fmtDays(days)} ngày` : '—'}</strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ManagerLeaveCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPickEmp = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [forOther, setForOther] = useState(false);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [handoverId, setHandoverId] = useState('');
  const [urgency, setUrgency] = useState('NORMAL');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [quotaPreview, setQuotaPreview] = useState<{
    used: number;
    remaining: number;
    annualQuota: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => workDays(startDate, endDate), [startDate, endDate]);
  const selected = emps.find((e) => String(e.id) === employeeId);

  useEffect(() => {
    api
      .get('/employees/options')
      .then((r) => {
        const list = (r.data as Emp[]).filter((e) => e.status === 'ACTIVE');
        setEmps(list);
        if (user?.employeeId) {
          setEmployeeId(String(user.employeeId));
        }
      })
      .catch(() => undefined);
  }, [user?.employeeId]);

  useEffect(() => {
    if (!canPickEmp || !forOther) {
      if (user?.employeeId) setEmployeeId(String(user.employeeId));
      return;
    }
  }, [canPickEmp, forOther, user?.employeeId]);

  useEffect(() => {
    if (!employeeId) {
      setQuotaPreview(null);
      return;
    }
    api
      .get<{ items: { employeeId: number; quota: { used: number; remaining: number; annualQuota: number } }[] }>(
        '/leave',
        { params: { pageSize: 100 } },
      )
      .then(({ data }) => {
        const mine = data.items.find((x) => String(x.employeeId) === employeeId);
        if (mine?.quota) setQuotaPreview(mine.quota);
        else setQuotaPreview({ used: 0, remaining: 12, annualQuota: 12 });
      })
      .catch(() => setQuotaPreview({ used: 0, remaining: 12, annualQuota: 12 }));
  }, [employeeId]);

  async function submit() {
    if (!employeeId) {
      setError('Chọn nhân viên');
      return;
    }
    if (!startDate || !endDate || days <= 0) {
      setError('Khoảng ngày không hợp lệ (chỉ tính ngày làm việc, trừ T7/CN)');
      return;
    }
    if (!reason.trim()) {
      setError('Nhập lý do nghỉ');
      return;
    }
    let finalReason = reason.trim();
    if (handoverNote.trim()) {
      finalReason += `\n\n[Ghi chú bàn giao]: ${handoverNote.trim()}`;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/leave', {
        leaveType,
        startDate,
        endDate,
        reason: finalReason,
        handoverEmployeeId: handoverId ? Number(handoverId) : undefined,
        urgency,
        attachmentName: attachmentName.trim() || undefined,
        attachmentKey: attachmentKey.trim() || undefined,
        employeeId: canPickEmp && forOther && employeeId ? Number(employeeId) : undefined,
      });
      navigate(`/leave/${data.id}`);
    } catch {
      setError('Gửi đơn thất bại (kiểm tra quỹ phép / quyền)');
    } finally {
      setSaving(false);
    }
  }

  const after =
    leaveType === 'ANNUAL' && quotaPreview
      ? Math.max(0, quotaPreview.remaining - days)
      : (quotaPreview?.remaining ?? 12);

  const eligible =
    leaveType !== 'ANNUAL' || days <= (quotaPreview?.remaining ?? 12);

  async function onDropFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const { data } = await api.post<{
        key: string;
        originalName: string;
      }>('/leave/files', fd);
      setAttachmentKey(data.key);
      setAttachmentName(data.originalName);
    } catch {
      setError('Tải tệp chứng từ thất bại (tối đa 10MB)');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="nx-lc">
      <div className="nx-lv-crumb">
        <Link to="/leave">Quản lý nghỉ phép</Link>
        <span>›</span>
        <span>Tạo đơn nghỉ phép mới</span>
      </div>
      <h1 className="nx-lc-title">Tạo Đơn Nghỉ Phép Mới</h1>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="nx-lc-grid">
        <div>
          <section className="nx-lc-card">
            <h2>
              <span className="nx-lc-num">01</span> Nhân viên &amp; quỹ phép
            </h2>
            {canPickEmp && (
              <div className="nx-lc-mode">
                <button
                  type="button"
                  className={!forOther ? 'active' : ''}
                  onClick={() => setForOther(false)}
                >
                  Cho bản thân
                </button>
                <button
                  type="button"
                  className={forOther ? 'active' : ''}
                  onClick={() => setForOther(true)}
                >
                  Tạo hộ nhân viên
                </button>
              </div>
            )}
            <div className="nx-lc-field">
              <label>Nhân viên</label>
              {canPickEmp && forOther ? (
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">— Chọn nhân viên —</option>
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.employeeCode})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="nx-lc-locked">
                  {selected?.fullName || user?.username || 'Hồ sơ của bạn'}
                  {selected?.position && (
                    <span className="nx-lv-sub"> · {selected.position}</span>
                  )}
                </div>
              )}
            </div>
            <div className="nx-lc-quota-cards">
              <div className="nx-lc-qcard">
                <span>Định mức năm</span>
                <strong>{quotaPreview?.annualQuota ?? 12}</strong>
              </div>
              <div className="nx-lc-qcard">
                <span>Đã sử dụng</span>
                <strong>{quotaPreview?.used ?? 0}</strong>
              </div>
              <div className="nx-lc-qcard highlight">
                <span>Còn lại</span>
                <strong>{quotaPreview?.remaining ?? 12}</strong>
              </div>
            </div>
          </section>

          <section className="nx-lc-card">
            <h2>
              <span className="nx-lc-num">02</span> Loại phép &amp; thời gian
            </h2>
            <div className="nx-lc-types">
              {(
                [
                  ['ANNUAL', 'Phép năm', '100% lương'],
                  ['SICK', 'Ốm đau BHXH', 'Theo chế độ'],
                  ['OTHER', 'Việc riêng', 'Có lương theo quy định'],
                  ['UNPAID', 'Không lương', 'Cần cấp cao duyệt'],
                ] as const
              ).map(([v, t, h]) => (
                <button
                  key={v}
                  type="button"
                  className={`nx-lc-type${leaveType === v ? ' active' : ''}`}
                  onClick={() => setLeaveType(v)}
                >
                  <strong>{t}</strong>
                  <span>{h}</span>
                </button>
              ))}
            </div>
            <div className="nx-lc-dates">
              <div className="nx-lc-field">
                <label>Từ ngày</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="nx-lc-field">
                <label>Đến ngày</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {days > 0 && (
              <div className="nx-lc-summary">
                Tổng {days} ngày làm việc (không tính thứ Bảy &amp; Chủ nhật)
              </div>
            )}
            <div className="nx-lc-field" style={{ marginTop: 12 }}>
              <label>Mức độ ưu tiên</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="NORMAL">Thường</option>
                <option value="URGENT">Khẩn cấp (SLA 24h)</option>
              </select>
            </div>
          </section>

          <section className="nx-lc-card">
            <h2>
              <span className="nx-lc-num">03</span> Lý do &amp; bàn giao công việc
            </h2>
            <div className="nx-lc-field">
              <label>Lý do nghỉ ({reason.length}/500)</label>
              <textarea
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Mô tả lý do và phạm vi nghỉ…"
              />
            </div>
            <div className="nx-lc-field">
              <label>Người tiếp nhận bàn giao</label>
              <select value={handoverId} onChange={(e) => setHandoverId(e.target.value)}>
                <option value="">— Không chỉ định —</option>
                {emps
                  .filter((e) => String(e.id) !== employeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="nx-lc-field">
              <label>Ghi chú bàn giao (tuỳ chọn)</label>
              <textarea
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                rows={2}
                placeholder="Công việc cần chuyển giao…"
              />
            </div>
          </section>

          <section className="nx-lc-card">
            <h2>
              <span className="nx-lc-num">04</span> Chứng từ đính kèm
            </h2>
            <div
              className="nx-lc-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onDropFile(e.dataTransfer.files[0] ?? null);
              }}
            >
              <p>
                {uploading
                  ? 'Đang tải tệp lên…'
                  : 'Kéo thả hoặc chọn tệp chứng từ'}
              </p>
              <span>Hỗ trợ PDF, PNG, JPG · tối đa 10MB</span>
              <label className="nx-lc-drop-btn">
                Chọn tệp
                <input
                  type="file"
                  hidden
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={uploading || saving}
                  onChange={(e) => {
                    void onDropFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>
              {attachmentName && <div className="nx-lc-drop-name">{attachmentName}</div>}
            </div>
          </section>
        </div>

        <aside className="nx-lc-aside">
          <section className="nx-lc-card nx-lc-side-summary">
            <h2>Tóm tắt đơn</h2>
            <div className="nx-lc-sum-row">
              <span>Nhân viên</span>
              <strong>{selected?.fullName || '—'}</strong>
            </div>
            <div className="nx-lc-sum-row">
              <span>Loại phép</span>
              <strong>{leaveType}</strong>
            </div>
            <div className="nx-lc-sum-row">
              <span>Số ngày</span>
              <strong>{days > 0 ? `${days} ngày` : '—'}</strong>
            </div>
            <div className="nx-lc-sum-row">
              <span>Thời gian</span>
              <strong>
                {startDate && endDate ? `${fmt(startDate)} → ${fmt(endDate)}` : '—'}
              </strong>
            </div>
            <div className="nx-lc-sum-row highlight">
              <span>Còn sau duyệt (AL)</span>
              <strong>{leaveType === 'ANNUAL' ? after : '—'}</strong>
            </div>
            <div className={`nx-lc-eligibility${eligible ? ' ok' : ' bad'}`}>
              {eligible ? 'Đủ điều kiện gửi đơn' : 'Vượt quỹ phép năm'}
            </div>
          </section>
        </aside>
      </div>

      <div className="nx-lc-foot">
        <button type="button" className="ghost" onClick={() => navigate('/leave')}>
          Hủy
        </button>
        <div className="spacer" />
        <button type="button" className="nx-btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Đang tạo…' : 'Tạo đơn'}
        </button>
      </div>
    </div>
  );
}

export default function LeaveCreatePage() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') {
    return <EmployeeLeaveCreatePage />;
  }
  return <ManagerLeaveCreatePage />;
}
