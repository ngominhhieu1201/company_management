import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/leave.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  departmentId?: number | null;
  position?: string | null;
  status: string;
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
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function LeaveCreatePage() {
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

  function onDropFile(file: File | null) {
    if (file) setAttachmentName(file.name);
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
            <div className="nx-lc-field">
              <label>Tên tệp tham chiếu</label>
              <input
                value={attachmentName}
                onChange={(e) => setAttachmentName(e.target.value)}
                placeholder="VD: giay_hen_kham.pdf"
              />
            </div>
            <div
              className="nx-lc-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropFile(e.dataTransfer.files[0] ?? null);
              }}
            >
              <p>Kéo thả tệp vào đây hoặc chọn tệp</p>
              <span>Chỉ lưu tên tham chiếu — không upload nhị phân</span>
              <label className="nx-lc-drop-btn">
                Chọn tệp
                <input
                  type="file"
                  hidden
                  onChange={(e) => onDropFile(e.target.files?.[0] ?? null)}
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
