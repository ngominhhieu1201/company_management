import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/leave.css';

type Row = {
  id: number;
  leaveCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  urgency: string;
  reason: string | null;
  createdAt: string;
  attachmentName: string | null;
  attachmentKey?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  handover: { fullName: string; employeeCode?: string; position?: string | null } | null;
  department: { name: string } | null;
};

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  departmentId?: number | null;
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

type Profile = {
  managerName?: string | null;
  fullName?: string;
};

const LEAVE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ANNUAL', label: 'Nghỉ phép thường niên (Hưởng 100% lương)' },
  { value: 'OTHER', label: 'Nghỉ việc riêng (Có lương theo quy định)' },
  { value: 'SICK', label: 'Nghỉ ốm BHXH (Theo chế độ)' },
  { value: 'UNPAID', label: 'Nghỉ không lương' },
];

const TYPE_SHORT: Record<string, string> = {
  ANNUAL: 'Phép năm (AL)',
  SICK: 'Ốm đau BHXH',
  UNPAID: 'Không lương',
  OTHER: 'Việc riêng',
};

const ST_LABEL: Record<string, string> = {
  PENDING: 'CHỜ DUYỆT (PENDING)',
  APPROVED: 'ĐÃ DUYỆT (APPROVED)',
  REJECTED: 'TỪ CHỐI (REJECTED)',
  CANCELLED: 'ĐÃ HỦY (CANCELLED)',
};

function workDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  let n = 0;
  const c = new Date(a);
  while (c <= b) {
    const d = c.getDay();
    if (d !== 0 && d !== 6) n += 1;
    c.setDate(c.getDate() + 1);
  }
  return n;
}

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtDays(n: number) {
  return Number.isInteger(n) ? `${n}.0` : n.toFixed(1);
}

function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function draftKey(employeeId: number | null | undefined) {
  return `nx-leave-draft-${employeeId ?? 'anon'}`;
}

type Draft = {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  handoverId: string;
  attachmentName: string;
  attachmentKey: string;
};

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function slaHint(createdAt: string, urgency: string) {
  const created = new Date(createdAt).getTime();
  const windowMs = urgency === 'URGENT' ? 24 * 3_600_000 : 48 * 3_600_000;
  const left = windowMs - (Date.now() - created);
  if (left <= 0) return 'Quá hạn SLA';
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return `Còn ${h}h${String(m).padStart(2, '0')}p SLA`;
}

export default function EmployeeLeavePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Row[]>([]);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [dash, setDash] = useState<DashEmp | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [chip, setChip] = useState<'all' | 'PENDING' | 'APPROVED' | 'closed'>('all');
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(searchParams.get('create') === '1');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handoverId, setHandoverId] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const year = new Date().getFullYear();
  const days = useMemo(() => workDays(startDate, endDate), [startDate, endDate]);

  const handoverEmp = emps.find((e) => String(e.id) === handoverId);

  const counts = useMemo(
    () => ({
      all: allRows.length,
      pending: allRows.filter((r) => r.status === 'PENDING').length,
      approved: allRows.filter((r) => r.status === 'APPROVED').length,
      closed: allRows.filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED').length,
    }),
    [allRows],
  );

  const sickUsed = useMemo(() => {
    return allRows
      .filter(
        (r) =>
          r.leaveType === 'SICK' &&
          r.status === 'APPROVED' &&
          r.startDate.startsWith(String(year)),
      )
      .reduce((s, r) => s + (r.daysCount ?? 0), 0);
  }, [allRows, year]);

  const loadMeta = useCallback(async () => {
    const [d, opts, all] = await Promise.all([
      api.get<DashEmp>('/dashboard'),
      api.get<Emp[]>('/employees/options'),
      api.get<{ items: Row[] }>('/leave', { params: { page: 1, pageSize: 100 } }),
    ]);
    setDash(d.data);
    setEmps((opts.data as Emp[]).filter((e) => e.status === 'ACTIVE'));
    setAllRows(all.data.items);
    if (user?.employeeId) {
      api
        .get<{ managerName?: string | null }>(`/employees/${user.employeeId}`)
        .then((r) => setProfile({ managerName: r.data.managerName }))
        .catch(() => undefined);
    }
  }, [user?.employeeId]);

  const loadList = useCallback(async () => {
    if (chip === 'closed') {
      const [rej, can] = await Promise.all([
        api.get<{ items: Row[] }>('/leave', { params: { page: 1, pageSize: 100, status: 'REJECTED' } }),
        api.get<{ items: Row[] }>('/leave', { params: { page: 1, pageSize: 100, status: 'CANCELLED' } }),
      ]);
      const merged = [...rej.data.items, ...can.data.items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setTotal(merged.length);
      setTotalPages(Math.max(1, Math.ceil(merged.length / 10)));
      setItems(merged.slice((page - 1) * 10, page * 10));
      return;
    }
    const params: Record<string, string | number> = { page, pageSize: 10 };
    if (chip === 'PENDING') params.status = 'PENDING';
    else if (chip === 'APPROVED') params.status = 'APPROVED';
    const list = await api.get<{ items: Row[]; total: number; totalPages: number }>('/leave', {
      params,
    });
    setItems(list.data.items);
    setTotal(list.data.total);
    setTotalPages(list.data.totalPages);
  }, [page, chip]);

  const refresh = useCallback(async () => {
    await loadMeta();
    await loadList();
  }, [loadMeta, loadList]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
        setError('');
      } catch {
        if (!c) setError('Không tải được dữ liệu nghỉ phép');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setFormOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!user?.employeeId) return;
    try {
      const raw = localStorage.getItem(draftKey(user.employeeId));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      setLeaveType(d.leaveType || 'ANNUAL');
      setStartDate(d.startDate || '');
      setEndDate(d.endDate || '');
      setReason(d.reason || '');
      setHandoverId(d.handoverId || '');
      setAttachmentName(d.attachmentName || '');
      setAttachmentKey(d.attachmentKey || '');
    } catch {
      /* ignore */
    }
  }, [user?.employeeId]);

  function closeForm() {
    setFormOpen(false);
    setSearchParams({}, { replace: true });
  }

  function saveDraft() {
    if (!user?.employeeId) return;
    const payload: Draft = {
      leaveType,
      startDate,
      endDate,
      reason,
      handoverId,
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
    if (!reason.trim()) {
      setError('Nhập lý do xin nghỉ');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/leave', {
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
        handoverEmployeeId: handoverId ? Number(handoverId) : undefined,
        attachmentName: attachmentName.trim() || undefined,
        attachmentKey: attachmentKey.trim() || undefined,
      });
      if (user?.employeeId) localStorage.removeItem(draftKey(user.employeeId));
      setReason('');
      setStartDate('');
      setEndDate('');
      setHandoverId('');
      setAttachmentName('');
      setAttachmentKey('');
      closeForm();
      setMsg('Đã gửi đơn lên quản lý phê duyệt');
      await refresh();
    } catch {
      setError('Gửi đơn thất bại (kiểm tra quỹ phép hoặc thử lại)');
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(id: number) {
    if (!window.confirm('Hủy đơn nghỉ phép đang chờ duyệt?')) return;
    setActionBusy(id);
    try {
      await api.patch(`/leave/${id}/cancel`);
      setMsg('Đã hủy đơn');
      await refresh();
    } catch {
      setError('Không hủy được đơn');
    } finally {
      setActionBusy(null);
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

  const annualQuota = dash?.annualQuota ?? 12;
  const annualUsed = dash?.annualUsed ?? 0;
  const available = dash?.leaveRemaining ?? Math.max(0, annualQuota - annualUsed);
  const managerLabel = profile?.managerName ? `QL ${profile.managerName}` : 'Quản lý trực tiếp';

  const usedSub =
    annualUsed > 0
      ? `${allRows.filter((r) => r.status === 'APPROVED' && r.leaveType === 'ANNUAL').length} đợt phép năm đã duyệt`
      : 'Chưa sử dụng phép năm';

  return (
    <div className="nx-emp-lv">
      <div className="nx-emp-lv-crumb">
        <span>Quản trị cá nhân</span>
        <span>›</span>
        <span>Phân hệ Nghỉ phép</span>
        <span>›</span>
        <span>Quản lý đơn nghỉ phép cá nhân</span>
      </div>

      <div className="nx-emp-lv-head">
        <h1>Nghỉ Phép Cá Nhân &amp; Quỹ Phép {year}</h1>
        <Link to="/leave/new" className="nx-btn-primary">
          + Tạo Đơn Nghỉ Phép Mới
        </Link>
      </div>

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

      <div className="nx-emp-lv-kpis">
        <div className="nx-emp-lv-kpi">
          <div className="nx-emp-lv-kpi-icon cal" aria-hidden />
          <div>
            <div className="label">Hạn mức phép năm {year}</div>
            <div className="value">{fmtDays(annualQuota)} ngày</div>
            <div className="hint">Định mức {annualQuota} ngày + 0 ngày thâm niên</div>
          </div>
        </div>
        <div className="nx-emp-lv-kpi">
          <div className="nx-emp-lv-kpi-icon used" aria-hidden />
          <div>
            <div className="label">Đã sử dụng</div>
            <div className="value">{fmtDays(annualUsed)} ngày</div>
            <div className="hint">{usedSub}</div>
          </div>
        </div>
        <div className="nx-emp-lv-kpi">
          <div className="nx-emp-lv-kpi-icon ok" aria-hidden />
          <div>
            <div className="label">Khả dụng hiện tại</div>
            <div className="value">{fmtDays(available)} ngày</div>
            <div className="hint ok">Đủ điều kiện tạo đơn mới</div>
          </div>
        </div>
        <div className="nx-emp-lv-kpi">
          <div className="nx-emp-lv-kpi-icon sick" aria-hidden />
          <div>
            <div className="label">Nghỉ ốm BHXH đã dùng</div>
            <div className="value">
              {fmtDays(sickUsed)} / 30 ngày
            </div>
            <div className="hint">
              {sickUsed > 0 ? 'Theo đơn ốm đã duyệt' : 'Chưa phát sinh trợ cấp BHXH'}
            </div>
          </div>
        </div>
      </div>

      {formOpen && (
        <section className="nx-emp-lv-form-panel">
          <div className="nx-emp-lv-form-head">
            <h2>Tạo Đơn Nghỉ Phép Mới</h2>
            <button type="button" className="nx-emp-lv-form-close" onClick={closeForm} aria-label="Đóng">
              ×
            </button>
          </div>
          <div className="nx-emp-lv-form-grid">
            <div className="nx-emp-lv-form-col">
              <div className="nx-lc-field">
                <label>Loại nghỉ phép</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {LEAVE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nx-emp-lv-date-row">
                <div className="nx-lc-field">
                  <label>Ca làm việc</label>
                  <select defaultValue="FULL" disabled title="API hiện chỉ hỗ trợ cả ngày">
                    <option value="FULL">Cả ngày</option>
                  </select>
                </div>
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
                <div className="nx-emp-lv-duration">
                  Thời lượng tính toán: <strong>{fmtDays(days)} ngày làm việc</strong>
                </div>
              )}
              <div className="nx-lc-field">
                <label>Người nhận bàn giao công việc</label>
                <select value={handoverId} onChange={(e) => setHandoverId(e.target.value)}>
                  <option value="">— Chọn đồng nghiệp —</option>
                  {emps
                    .filter((e) => e.id !== user?.employeeId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName} — {e.employeeCode}
                        {dash?.departmentName ? ` (${dash.departmentName})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="nx-emp-lv-form-col">
              <div className="nx-lc-field">
                <label>Lý do xin nghỉ</label>
                <textarea
                  rows={5}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mô tả lý do và phạm vi công việc cần bàn giao…"
                />
              </div>
              <div
                className="nx-lc-dropzone nx-emp-lv-drop"
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
              <div className="nx-emp-lv-flow">
                <span className="on">Tôi tạo</span>
                <i className="line" />
                <span className={handoverId ? 'on' : ''}>
                  {handoverEmp ? `${handoverEmp.fullName} nhận việc` : 'Bàn giao'}
                </span>
                <i className="line" />
                <span>{managerLabel}</span>
              </div>
            </div>
          </div>
          <div className="nx-emp-lv-form-actions">
            <button type="button" className="nx-emp-lv-draft" onClick={saveDraft}>
              Lưu bản nháp
            </button>
            <button
              type="button"
              className="nx-btn-primary nx-emp-lv-submit"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? 'Đang gửi…' : 'Gửi đơn lên quản lý phê duyệt'}
            </button>
          </div>
        </section>
      )}

      <h2 className="nx-emp-lv-history-title">Lịch sử đơn đã gửi</h2>
      <div className="nx-emp-lv-tabs">
        {(
          [
            ['all', `Tất cả (${counts.all})`],
            ['PENDING', `Đang chờ duyệt (${counts.pending})`],
            ['APPROVED', `Đã duyệt (${counts.approved})`],
            ['closed', `Đã hủy/Từ chối (${counts.closed})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`nx-emp-lv-tab${chip === k ? ' active' : ''}`}
            onClick={() => {
              setChip(k);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <Spinner size="sm" animation="border" />
        </div>
      ) : (
        <div className="nx-emp-lv-table-wrap">
          <table className="nx-emp-lv-table">
            <thead>
              <tr>
                <th>Mã đơn &amp; loại phép</th>
                <th>Thời gian nghỉ</th>
                <th>Bàn giao &amp; đính kèm</th>
                <th>Tiến trình phê duyệt</th>
                <th>Trạng thái</th>
                <th className="nx-emp-lv-th-act">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="nx-lv-empty">
                    Chưa có đơn nghỉ phép
                  </td>
                </tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="nx-emp-lv-code">#{r.leaveCode}</div>
                    <div className="nx-lv-sub">{TYPE_SHORT[r.leaveType] || r.leaveType}</div>
                  </td>
                  <td>
                    <strong>
                      {fmt(r.startDate)}
                      {r.startDate !== r.endDate ? ` – ${fmt(r.endDate)}` : ''}
                    </strong>
                    <span className="nx-lv-sub">
                      {fmtDays(r.daysCount)} ngày (Cả ngày)
                    </span>
                  </td>
                  <td>
                    {r.handover ? (
                      <div className="nx-emp-lv-handover">
                        <span className="nx-lv-avatar sm">{initials(r.handover.fullName)}</span>
                        <div>
                          <strong>{r.handover.fullName}</strong>
                          <span className="nx-lv-sub">
                            {r.status === 'PENDING' ? 'Chờ xác nhận bàn giao' : 'Đã nhận bàn giao'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="nx-lv-muted">Không chỉ định</span>
                    )}
                    {r.attachmentName &&
                      (r.attachmentKey ? (
                        <a
                          className="nx-lv-attach nx-emp-lv-attach"
                          href={`${apiBase}/leave/files/${encodeURIComponent(r.attachmentKey)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.attachmentName}
                        </a>
                      ) : (
                        <span className="nx-lv-attach nx-emp-lv-attach">
                          {r.attachmentName}
                        </span>
                      ))}
                  </td>
                  <td>
                    <div className="nx-emp-lv-steps">
                      <span className="done" title="Đã gửi" />
                      <span className={r.handover ? 'done' : 'pending'} title="Bàn giao" />
                      <span
                        className={
                          r.status === 'APPROVED'
                            ? 'done'
                            : r.status === 'PENDING'
                              ? 'current'
                              : 'pending'
                        }
                        title="Quản lý"
                      />
                    </div>
                    <span className="nx-lv-sub">
                      {r.status === 'PENDING'
                        ? `${managerLabel.replace(/^QL /, 'Quản lý: ')} (${slaHint(r.createdAt, r.urgency)})`
                        : r.reviewerName
                          ? `Duyệt: ${r.reviewerName}`
                          : r.status === 'CANCELLED'
                            ? 'Đã hủy bởi nhân viên'
                            : r.status === 'REJECTED'
                              ? 'Quản lý từ chối'
                              : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`nx-emp-lv-st ${r.status}`}>
                      {ST_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="nx-emp-lv-act-cell">
                    <Link to={`/leave/${r.id}`} className="nx-emp-lv-link">
                      Chi tiết
                    </Link>
                    {r.status === 'PENDING' && (
                      <button
                        type="button"
                        className="nx-emp-lv-cancel"
                        disabled={actionBusy === r.id}
                        onClick={() => void cancelRequest(r.id)}
                      >
                        Hủy đơn
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="nx-lv-pager">
            <div>
              Trang {page}/{totalPages} · {total} đơn
            </div>
            <div className="nx-lv-pager-btns">
              <button
                type="button"
                className="nx-btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="nx-btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
