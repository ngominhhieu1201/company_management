import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/leave.css';

type Emp = { id: number; fullName: string; employeeCode: string; departmentId?: number | null; position?: string | null; status: string };

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

export default function LeaveCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPickEmp = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [emps, setEmps] = useState<Emp[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handoverId, setHandoverId] = useState('');
  const [urgency, setUrgency] = useState('NORMAL');
  const [attachmentName, setAttachmentName] = useState('');
  const [quotaPreview, setQuotaPreview] = useState<{ used: number; remaining: number; annualQuota: number } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => workDays(startDate, endDate), [startDate, endDate]);
  const selected = emps.find((e) => String(e.id) === employeeId);

  useEffect(() => {
    api.get('/employees/options').then((r) => {
      const list = (r.data as Emp[]).filter((e) => e.status === 'ACTIVE');
      setEmps(list);
      if (!canPickEmp && user?.employeeId) {
        setEmployeeId(String(user.employeeId));
      }
    }).catch(() => undefined);
  }, [canPickEmp, user?.employeeId]);

  useEffect(() => {
    if (!employeeId) { setQuotaPreview(null); return; }
    // approximate from leave list for this employee
    api.get('/leave', { params: { page: 1, pageSize: 1, q: selected?.employeeCode } })
      .then(async () => {
        const { data } = await api.get<{ items: { employeeId: number; quota: { used: number; remaining: number; annualQuota: number } }[] }>('/leave', {
          params: { pageSize: 50 },
        });
        const mine = data.items.find((x) => String(x.employeeId) === employeeId);
        if (mine?.quota) setQuotaPreview(mine.quota);
        else setQuotaPreview({ used: 0, remaining: 12, annualQuota: 12 });
      })
      .catch(() => setQuotaPreview({ used: 0, remaining: 12, annualQuota: 12 }));
  }, [employeeId, selected?.employeeCode]);

  async function submit() {
    if (!employeeId && !user?.employeeId) {
      setError('Chọn nhân viên');
      return;
    }
    if (!startDate || !endDate || days <= 0) {
      setError('Khoảng ngày không hợp lệ (chỉ tính ngày làm việc)');
      return;
    }
    if (!reason.trim()) {
      setError('Nhập lý do nghỉ');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/leave', {
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
        handoverEmployeeId: handoverId ? Number(handoverId) : undefined,
        urgency,
        attachmentName: attachmentName.trim() || undefined,
        employeeId: canPickEmp && employeeId ? Number(employeeId) : undefined,
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
      : quotaPreview?.remaining ?? 12;

  return (
    <div className="nx-lc">
      <div className="nx-lv-crumb">
        <Link to="/leave">Quay lại danh sách</Link><span>›</span><span>Tạo đơn nghỉ phép mới</span>
      </div>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>Khởi Tạo Đơn Nghỉ Phép Mới</h1>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <div className="nx-lc-grid">
        <div>
          <section className="nx-lc-card">
            <h2>01 · Nhân viên & loại nghỉ phép</h2>
            {canPickEmp ? (
              <div className="nx-lc-field">
                <label>Nhân viên</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
                </select>
                {selected && <div style={{ fontSize: '.8rem', color: '#7a8a85', marginTop: 4 }}>{selected.position || selected.employeeCode}</div>}
              </div>
            ) : (
              <div className="nx-lc-field">
                <label>Nhân viên</label>
                <div style={{ fontWeight: 700 }}>{selected?.fullName || 'Hồ sơ của bạn'}</div>
              </div>
            )}
            <div className="nx-lc-types">
              {([
                ['ANNUAL', 'Phép năm', '100% lương'],
                ['SICK', 'Ốm đau BHXH', 'Theo chế độ'],
                ['OTHER', 'Việc riêng có lương', 'Giới hạn sự kiện'],
                ['UNPAID', 'Không hưởng lương', 'Cần cấp cao duyệt'],
              ] as const).map(([v, t, h]) => (
                <label key={v} className={`nx-lc-type${leaveType === v ? ' active' : ''}`}>
                  <input type="radio" name="lt" checked={leaveType === v} onChange={() => setLeaveType(v)} style={{ marginRight: 6 }} />
                  <strong>{t}</strong>
                  <span>{h}</span>
                </label>
              ))}
            </div>
            <div className="nx-lc-field" style={{ marginTop: 12 }}>
              <label>Từ ngày</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="nx-lc-field">
              <label>Đến ngày</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {days > 0 && <div className="nx-lc-summary">Tổng ngày phép tính: {days} ngày (trừ T7/CN)</div>}
          </section>

          <section className="nx-lc-card">
            <h2>02 · Lý do & bàn giao</h2>
            <div className="nx-lc-field">
              <label>Lý do nghỉ ({reason.length}/500)</label>
              <textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
            </div>
            <div className="nx-lc-field">
              <label>Người tiếp nhận bàn giao</label>
              <select value={handoverId} onChange={(e) => setHandoverId(e.target.value)}>
                <option value="">— Không có —</option>
                {emps.filter((e) => String(e.id) !== employeeId).map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div className="nx-lc-field">
              <label>Mức độ</label>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="NORMAL">Thường</option>
                <option value="URGENT">Khẩn cấp (duyệt trong 24h)</option>
              </select>
            </div>
          </section>

          <section className="nx-lc-card">
            <h2>03 · Chứng từ (tên tệp tham chiếu)</h2>
            <div className="nx-lc-field">
              <label>Tên file đính kèm (tuỳ chọn)</label>
              <input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="VD: giay_hen_kham.pdf" />
              <div style={{ fontSize: '.75rem', color: '#7a8a85', marginTop: 4 }}>Lưu tên tham chiếu — upload nhị phân có thể bổ sung sau.</div>
            </div>
          </section>
        </div>

        <aside>
          <section className="nx-lc-card nx-lc-quota">
            <h2>Hạn mức quỹ phép năm</h2>
            <div className="row"><span>Định mức</span><strong>{quotaPreview?.annualQuota ?? 12} ngày</strong></div>
            <div className="row"><span>Đã dùng</span><strong>{quotaPreview?.used ?? 0}</strong></div>
            <div className="row"><span>Đơn này</span><strong>{days}</strong></div>
            <div className="row"><span>Còn sau duyệt</span><strong>{after}</strong></div>
            <div className="nx-lc-summary" style={{ marginTop: 10 }}>
              {leaveType === 'ANNUAL' && days > (quotaPreview?.remaining ?? 12)
                ? 'Vượt quỹ phép năm'
                : 'Đủ điều kiện gửi đơn'}
            </div>
          </section>
          <section className="nx-lc-card">
            <h2>Luồng phê duyệt</h2>
            <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.85rem' }}>
              <li>Quản lý trực tiếp thẩm định</li>
              <li>Admin / HR phê duyệt cuối</li>
            </ol>
            <div style={{ fontSize: '.75rem', color: '#7a8a85', marginTop: 8 }}>1 ngày phép = 8 giờ (08:30–17:30)</div>
          </section>
        </aside>
      </div>

      <div className="nx-lc-foot">
        <button type="button" className="ghost" onClick={() => navigate('/leave')}>Hủy bỏ</button>
        <div className="spacer" />
        <button type="button" className="nx-btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Đang gửi…' : 'Gửi đơn nghỉ phép'}
        </button>
      </div>
    </div>
  );
}
