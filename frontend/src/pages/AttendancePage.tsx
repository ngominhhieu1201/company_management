import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import MonthPicker from '../components/MonthPicker';
import { useAuth } from '../contexts/AuthContext';
import '../styles/attendance.css';

type Row = {
  id: number;
  recordCode: string;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInPhotoKey: string | null;
  checkOutPhotoKey: string | null;
  status: string;
  punctuality: string;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  workMinutes: number | null;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  flagged: boolean;
  employee: { id: number; fullName: string; employeeCode: string; position?: string | null } | null;
  department: { id: number; name: string } | null;
};

type Stats = {
  date: string;
  total: number;
  headcount: number;
  present: number;
  presentRate: number | null;
  onTime: number;
  late: number;
  onTimeRate: number | null;
  inProgress: number;
  completed: number;
  anomalies: number;
  needReview: number;
  flagged: number;
  flaggedToday?: number;
  allTimeTotal: number;
};

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function initials(n: string) {
  const p = n.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function timeOnly(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDur(mins: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function currentMonthKey() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function fmtDateShort(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function countWorkdaysInMonth(monthKey: string) {
  const [ys, ms] = monthKey.split('-');
  const y = Number(ys);
  const m = Number(ms) - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const wd = new Date(y, m, day).getDay();
    if (wd >= 1 && wd <= 5) n++;
  }
  return n;
}
function monthLabel(monthKey: string) {
  const [ys, ms] = monthKey.split('-');
  return `Tháng ${Number(ms)}/${ys}`;
}

function exportCsv(rows: Row[]) {
  const header = ['Code', 'Date', 'Employee', 'Dept', 'CheckIn', 'CheckOut', 'Punctuality', 'Status'];
  const lines = rows.map((r) =>
    [r.recordCode, r.workDate, r.employee?.fullName ?? '', r.department?.name ?? '', r.checkInTime ?? '', r.checkOutTime ?? '', r.punctuality, r.status]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexora-attendance-${todayLocal()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function statusPill(r: Row) {
  if (r.flagged) return { cls: 'flag', label: 'Cần đối soát' };
  if (r.status === 'IN_PROGRESS') return { cls: 'prog', label: 'Đang làm việc' };
  if (r.punctuality === 'LATE') return { cls: 'late', label: 'Đi muộn' };
  if (r.status === 'COMPLETED') return { cls: 'on', label: 'Hoàn tất ca' };
  return { cls: 'muted', label: 'Chưa chấm' };
}

function empHistoryStatus(r: Row) {
  if (r.flagged) return { cls: 'flag', label: 'Cần đối soát' };
  if (!r.checkInTime) return { cls: 'muted', label: 'Chưa chấm' };
  if (r.status === 'IN_PROGRESS') return { cls: 'prog', label: 'Đang trong ca' };
  if (r.punctuality === 'LATE') return { cls: 'late', label: 'Đi muộn' };
  return { cls: 'on', label: 'Hợp lệ' };
}

function todayShiftStatus(today: Row | null) {
  if (!today) return { cls: 'muted', label: 'Chưa check-in', sub: 'Chưa có bản ghi hôm nay' };
  if (today.status === 'IN_PROGRESS') {
    return {
      cls: 'prog',
      label: 'Đang trong ca',
      sub: `Vào lúc ${timeOnly(today.checkInTime)} · chưa check-out`,
    };
  }
  if (today.punctuality === 'LATE') {
    return {
      cls: 'late',
      label: 'Hoàn tất · đi muộn',
      sub: `Vào ${timeOnly(today.checkInTime)} · Ra ${timeOnly(today.checkOutTime)}`,
    };
  }
  return {
    cls: 'on',
    label: 'Hoàn tất ca',
    sub: `Vào ${timeOnly(today.checkInTime)} · Ra ${timeOnly(today.checkOutTime)}`,
  };
}

function photoUrl(key: string | null) {
  return key ? `${apiBase}/attendance/photo/${key}` : null;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isHistoryView = searchParams.get('view') === 'history';
  const videoRef = useRef<HTMLVideoElement>(null);
  const isManagerView = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isEmployeeView = user?.role === 'EMPLOYEE';
  const isAdmin = user?.role === 'ADMIN';

  const [items, setItems] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [today, setToday] = useState<Row | null>(null);
  const [monthRows, setMonthRows] = useState<Row[]>([]);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [histPage, setHistPage] = useState(1);
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [chip, setChip] = useState('all');

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<'in' | 'out' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const loadManager = useCallback(async () => {
    const params: Record<string, string | number> = {
      page,
      pageSize: 10,
      date: date || undefined!,
    };
    if (q) params.q = q;
    if (departmentId) params.departmentId = Number(departmentId);
    if (chip === 'inprogress') params.status = 'IN_PROGRESS';
    else if (chip === 'completed') params.status = 'COMPLETED';
    else if (chip === 'anomalies') params.anomalies = '1';
    else if (statusFilter === 'IN_PROGRESS') params.status = 'IN_PROGRESS';
    else if (statusFilter === 'COMPLETED') params.status = 'COMPLETED';
    else if (statusFilter === 'LATE') params.punctuality = 'LATE';
    else if (statusFilter === 'ANOMALIES') params.anomalies = '1';

    const [s, list] = await Promise.all([
      api.get<Stats>('/attendance/stats', { params: { date } }),
      api.get<{ items: Row[]; total: number; totalPages: number }>('/attendance', { params }),
    ]);
    setStats(s.data);
    setItems(list.data.items);
    setTotal(list.data.total);
    setTotalPages(list.data.totalPages);
  }, [page, date, q, departmentId, statusFilter, chip]);

  const loadEmployeeCheckIn = useCallback(async () => {
    const t = await api.get<Row | null>('/attendance/today').catch(() => ({ data: null }));
    setToday(t.data);
  }, []);

  const loadEmployeeHistory = useCallback(async () => {
    const list = await api.get<{ items: Row[] }>('/attendance', {
      params: { page: 1, pageSize: 100 },
    });
    setMonthRows(list.data.items);
  }, []);

  const load = useCallback(async () => {
    if (isManagerView) {
      await loadManager();
      return;
    }
    if (isEmployeeView && isHistoryView) {
      await loadEmployeeHistory();
      return;
    }
    if (isEmployeeView) {
      await loadEmployeeCheckIn();
    }
  }, [isManagerView, isEmployeeView, isHistoryView, loadManager, loadEmployeeCheckIn, loadEmployeeHistory]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
        setError('');
      } catch {
        if (!c) setError('Không tải được dữ liệu chấm công');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isManagerView) return;
    const t = setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qDraft, isManagerView]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  useEffect(() => {
    setHistPage(1);
  }, [monthFilter, chip, statusFilter, qDraft]);

  const monthBaseRows = useMemo(
    () => monthRows.filter((r) => r.workDate.startsWith(monthFilter)),
    [monthRows, monthFilter],
  );

  const filteredMonthRows = useMemo(() => {
    let rows = [...monthBaseRows];
    if (chip === 'late') rows = rows.filter((r) => r.punctuality === 'LATE');
    else if (chip === 'ontime') rows = rows.filter((r) => r.punctuality === 'ON_TIME' || r.punctuality === 'EARLY');
    else if (chip === 'flag') rows = rows.filter((r) => r.flagged);
    if (statusFilter === 'ON_TIME') rows = rows.filter((r) => r.punctuality === 'ON_TIME' || r.punctuality === 'EARLY');
    else if (statusFilter === 'LATE') rows = rows.filter((r) => r.punctuality === 'LATE');
    else if (statusFilter === 'IN_PROGRESS') rows = rows.filter((r) => r.status === 'IN_PROGRESS');
    const query = qDraft.trim().toLowerCase();
    if (query) {
      rows = rows.filter(
        (r) =>
          r.recordCode.toLowerCase().includes(query) ||
          r.workDate.includes(query) ||
          r.shiftLabel.toLowerCase().includes(query),
      );
    }
    return rows.sort((a, b) => b.workDate.localeCompare(a.workDate) || b.id - a.id);
  }, [monthBaseRows, chip, statusFilter, qDraft]);

  const histPageSize = 10;
  const histTotalPages = Math.max(1, Math.ceil(filteredMonthRows.length / histPageSize));
  const histSlice = filteredMonthRows.slice((histPage - 1) * histPageSize, histPage * histPageSize);

  const monthSummary = useMemo(() => {
    const workdays = countWorkdaysInMonth(monthFilter);
    const withIn = monthBaseRows.filter((r) => r.checkInTime);
    const presentDays = withIn.length;
    const workMinutes = withIn.reduce((sum, r) => sum + (r.workMinutes ?? 0), 0);
    const targetMinutes = workdays * 8 * 60;
    const withPhoto = withIn.filter((r) => r.checkInPhotoKey).length;
    const photoPct = withIn.length > 0 ? Math.round((withPhoto / withIn.length) * 1000) / 10 : null;
    return {
      workdays,
      presentDays,
      workMinutes,
      targetMinutes,
      photoPct,
      onTime: withIn.filter((r) => r.punctuality !== 'LATE').length,
      late: withIn.filter((r) => r.punctuality === 'LATE').length,
      flagged: monthBaseRows.filter((r) => r.flagged).length,
    };
  }, [monthBaseRows, monthFilter]);

  async function syncReload() {
    setSyncing(true);
    try {
      await load();
      setMsg('Đã đồng bộ dữ liệu chấm công');
      setTimeout(() => setMsg(''), 2500);
    } catch {
      setError('Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  }

  async function startCamera(next: 'in' | 'out') {
    setError('');
    setMsg('');
    setPreview(null);
    setBlob(null);
    setMode(next);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch {
      setError('Không mở được camera');
      setMode(null);
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (b) => {
        if (!b) return;
        setBlob(b);
        setPreview(URL.createObjectURL(b));
      },
      'image/jpeg',
      0.9,
    );
  }

  async function confirmCheck() {
    if (!blob || !mode) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', blob, 'capture.jpg');
      await api.post(mode === 'in' ? '/attendance/check-in' : '/attendance/check-out', fd);
      setMsg(mode === 'in' ? 'Check-in thành công' : 'Check-out thành công');
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setMode(null);
      setPreview(null);
      setBlob(null);
      await loadEmployeeCheckIn();
    } catch {
      setError('Chấm công thất bại');
    } finally {
      setBusy(false);
    }
  }

  function cancelCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setMode(null);
    setPreview(null);
    setBlob(null);
  }

  const canIn = isEmployeeView && user?.employeeId && !today;
  const canOut = isEmployeeView && today && today.status === 'IN_PROGRESS';
  const shiftStart = today?.shiftStart ?? '08:30';
  const shiftEnd = today?.shiftEnd ?? '17:30';
  const shiftLabel = today?.shiftLabel ?? 'Ca Hành chính';
  const shiftSt = todayShiftStatus(today);

  if (isEmployeeView && !isHistoryView) {
    return (
      <div className="nx-emp-att-page">
        <nav className="nx-att-crumb nx-emp-att-crumb">
          <span>Cá nhân</span>
          <span>›</span>
          <span>Chấm công</span>
        </nav>
        <div className="nx-att-head nx-emp-att-head">
          <div>
            <h1>Chấm công ca làm việc</h1>
            <p className="nx-emp-att-lead">Ghi nhận vào/ra ca bằng ảnh chụp trực tiếp — thời gian lấy từ máy chủ (SRS).</p>
          </div>
          <Link to="/attendance?view=history" className="nx-btn-outline nx-emp-att-link-hist">
            Lịch sử công →
          </Link>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {msg && <Alert variant="success">{msg}</Alert>}

        {loading ? (
          <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>
        ) : (
          <>
            <section className="nx-emp-att-shift-card">
              <div className="nx-emp-att-shift-top">
                <div>
                  <div className="nx-emp-att-shift-label">Ca hôm nay · {todayLocal()}</div>
                  <div className="nx-emp-att-shift-time">
                    {shiftLabel} · {shiftStart} – {shiftEnd}
                  </div>
                </div>
                <span className={`nx-att-st ${shiftSt.cls} nx-emp-att-shift-pill`}>{shiftSt.label}</span>
              </div>
              <p className="nx-emp-att-shift-sub">{shiftSt.sub}</p>
            </section>

            <section className="nx-att-check nx-emp-att-check">
              <div className="nx-emp-att-check-head">
                <div>
                  <strong>Check-in / Check-out</strong>
                  <div className="nx-emp-att-note">
                    Mỗi lần chấm cần chụp ảnh khuôn mặt; timestamp được ghi nhận theo giờ máy chủ.
                  </div>
                </div>
                <div className="nx-emp-att-check-actions">
                  <button type="button" className="nx-btn-primary nx-emp-att-btn-in" disabled={!canIn || !!mode} onClick={() => void startCamera('in')}>
                    Check-in
                  </button>
                  <button type="button" className="nx-btn-outline nx-emp-att-btn-out" disabled={!canOut || !!mode} onClick={() => void startCamera('out')}>
                    Check-out
                  </button>
                </div>
              </div>
              {mode && (
                <div className="nx-emp-att-camera">
                  {!preview ? (
                    <video ref={videoRef} playsInline muted />
                  ) : (
                    <img src={preview} alt="Xem trước ảnh chấm công" />
                  )}
                  <div className="nx-emp-att-camera-actions">
                    {!preview && (
                      <button type="button" className="nx-btn-outline" onClick={capture}>
                        Chụp ảnh
                      </button>
                    )}
                    {preview && (
                      <button type="button" className="nx-btn-primary" disabled={busy} onClick={() => void confirmCheck()}>
                        {busy ? 'Đang gửi…' : 'Xác nhận chấm công'}
                      </button>
                    )}
                    <button type="button" className="nx-emp-att-cancel" onClick={cancelCamera}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  if (isEmployeeView && isHistoryView) {
    return (
      <div className="nx-emp-att-page">
        <nav className="nx-att-crumb nx-emp-att-crumb">
          <span>Cá nhân</span>
          <span>›</span>
          <Link to="/attendance">Chấm công</Link>
          <span>›</span>
          <span>Lịch sử công</span>
        </nav>
        <div className="nx-att-head nx-emp-att-head">
          <div>
            <h1>Đối Soát Chấm Công Cá Nhân</h1>
            <p className="nx-emp-att-lead">Theo dõi ngày công, giờ làm và bằng chứng ảnh trong tháng.</p>
          </div>
          <Link to="/attendance" className="nx-btn-primary">
            Chấm công hôm nay
          </Link>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

        {loading ? (
          <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>
        ) : (
          <>
            <div className="nx-att-kpis nx-att-kpis-4 nx-emp-att-kpis">
              <div className="nx-att-kpi scope">
                <div className="label">Ngày công chuẩn tháng</div>
                <div className="value">{monthSummary.workdays}</div>
                <div className="sub">{monthLabel(monthFilter)} · T2–T6</div>
              </div>
              <div className="nx-att-kpi on">
                <div className="label">Ngày đạt</div>
                <div className="value">{monthSummary.presentDays}</div>
                <div className="sub">Có check-in trong tháng</div>
              </div>
              <div className="nx-att-kpi prog">
                <div className="label">Giờ công</div>
                <div className="value">{fmtDur(monthSummary.workMinutes)}</div>
                <div className="sub">Mục tiêu ~ {fmtDur(monthSummary.targetMinutes)}</div>
              </div>
              <div className="nx-att-kpi late">
                <div className="label">Ảnh hợp lệ</div>
                <div className="value">{monthSummary.photoPct != null ? `${monthSummary.photoPct}%` : '—'}</div>
                <div className="sub">Có ảnh check-in / lượt chấm</div>
              </div>
            </div>

            <div className="nx-att-filters nx-emp-att-filters">
              <label className="search">
                <input
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  placeholder="Tìm ngày, mã bản ghi, ca…"
                />
              </label>
              <MonthPicker value={monthFilter} onChange={setMonthFilter} />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setChip('all');
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ON_TIME">Đúng giờ</option>
                <option value="LATE">Đi muộn</option>
                <option value="IN_PROGRESS">Đang trong ca</option>
              </select>
            </div>

            <div className="nx-att-chips">
              {[
                ['all', `Tất cả (${filteredMonthRows.length})`],
                ['ontime', `Đúng giờ (${monthSummary.onTime})`],
                ['late', `Đi muộn (${monthSummary.late})`],
                ['flag', `Cần đối soát (${monthSummary.flagged})`],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`nx-att-chip${chip === k ? ' active' : ''}`}
                  onClick={() => {
                    setChip(k);
                    setStatusFilter('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="nx-att-wrap nx-emp-att-table-wrap">
              <table className="nx-att-table nx-emp-att-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Ca</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Tích lũy</th>
                    <th>Ảnh</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {histSlice.length === 0 && (
                    <tr><td colSpan={8} className="nx-att-empty">Không có bản ghi trong tháng</td></tr>
                  )}
                  {histSlice.map((r) => {
                    const st = empHistoryStatus(r);
                    const inUrl = photoUrl(r.checkInPhotoKey);
                    const outUrl = photoUrl(r.checkOutPhotoKey);
                    return (
                      <tr key={r.id} onClick={() => navigate(`/attendance/${r.id}`)}>
                        <td>
                          <strong>{fmtDateShort(r.workDate)}</strong>
                          <span className="nx-emp-att-row-code">#{r.recordCode}</span>
                        </td>
                        <td>
                          <strong className="nx-att-shift-title">{r.shiftLabel}</strong>
                          <span className="nx-att-shift-sub">{r.shiftStart} – {r.shiftEnd}</span>
                        </td>
                        <td>
                          <div className={r.punctuality === 'LATE' ? 'nx-att-time warn' : r.checkInTime ? 'nx-att-time ok' : ''}>
                            {timeOnly(r.checkInTime)}
                          </div>
                        </td>
                        <td>{r.status === 'IN_PROGRESS' ? '—' : timeOnly(r.checkOutTime)}</td>
                        <td>{fmtDur(r.workMinutes)}</td>
                        <td className="nx-emp-att-thumbs" onClick={(e) => e.stopPropagation()}>
                          <div className="nx-emp-att-thumb-row">
                            {inUrl ? (
                              <a href={inUrl} target="_blank" rel="noreferrer" title="Ảnh check-in">
                                <img src={inUrl} alt="" />
                              </a>
                            ) : (
                              <span className="nx-emp-att-thumb-empty">—</span>
                            )}
                            {outUrl ? (
                              <a href={outUrl} target="_blank" rel="noreferrer" title="Ảnh check-out">
                                <img src={outUrl} alt="" />
                              </a>
                            ) : (
                              <span className="nx-emp-att-thumb-empty muted">—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`nx-att-st ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="nx-att-detail">
                          <Link to={`/attendance/${r.id}`} onClick={(e) => e.stopPropagation()}>
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="nx-att-pager">
                <div>
                  Hiển thị trang {histPage}/{histTotalPages} · {filteredMonthRows.length} bản ghi · {monthLabel(monthFilter)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="nx-btn-outline" disabled={histPage <= 1} onClick={() => setHistPage((p) => p - 1)}>‹</button>
                  <button type="button" className="nx-btn-outline" disabled={histPage >= histTotalPages} onClick={() => setHistPage((p) => p + 1)}>›</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="nx-att-crumb">
        <span>Quản trị hệ thống</span>
        <span>›</span>
        <span>Quản lý chấm công</span>
      </div>
      <div className="nx-att-head">
        <h1>Quản Lý & Theo Dõi Chấm Công</h1>
        <div className="nx-att-head-actions">
          <button type="button" className="nx-btn-outline" disabled={syncing} onClick={() => void syncReload()}>
            {syncing ? 'Đang đồng bộ…' : 'Đồng bộ'}
          </button>
          <button type="button" className="nx-btn-primary" onClick={() => exportCsv(items)}>
            Xuất Excel
          </button>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      {stats && (
        <div className="nx-att-kpis nx-att-kpis-4">
          <div className="nx-att-kpi scope">
            <div className="label">Quy mô</div>
            <div className="value">
              {stats.present}/{stats.headcount}
            </div>
            <div className="sub">{stats.total} bản ghi · {stats.date}</div>
          </div>
          <div className="nx-att-kpi on">
            <div className="label">Có mặt hôm nay</div>
            <div className="value">{stats.presentRate != null ? `${stats.presentRate}%` : '—'}</div>
            <div className="sub">{stats.present} nhân sự đã check-in</div>
          </div>
          <div className="nx-att-kpi prog">
            <div className="label">Đang làm việc</div>
            <div className="value">{stats.inProgress}</div>
            <div className="sub">Ca chưa check-out</div>
          </div>
          <div className="nx-att-kpi late">
            <div className="label">Bất thường</div>
            <div className="value">{stats.anomalies}</div>
            <div className="sub">Muộn hoặc cần đối soát</div>
          </div>
        </div>
      )}

      <div className="nx-att-filters">
        <label className="search">
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Tìm họ tên, mã NV, phòng ban…"
          />
        </label>
        <input className="nx-att-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        {isAdmin && (
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
            <option value="">Tất cả phòng ban</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setChip('all');
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="IN_PROGRESS">Đang làm việc</option>
          <option value="COMPLETED">Hoàn tất ca</option>
          <option value="LATE">Đi muộn</option>
          <option value="ANOMALIES">Bất thường</option>
        </select>
      </div>

      <div className="nx-att-chips">
        {[
          ['all', `Tất cả (${stats?.total ?? 0})`],
          ['inprogress', `Đang làm việc (${stats?.inProgress ?? 0})`],
          ['completed', `Hoàn tất ca (${stats?.completed ?? 0})`],
          ['anomalies', `Bất thường (${stats?.anomalies ?? 0})`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`nx-att-chip${chip === k ? ' active' : ''}`}
            onClick={() => {
              setChip(k);
              setStatusFilter('');
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>
      ) : (
        <div className="nx-att-wrap">
          <table className="nx-att-table nx-att-table-mgr">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Nhóm / Ca</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Tích lũy</th>
                <th>Địa điểm</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8} className="nx-att-empty">Không có bản ghi</td></tr>
              )}
              {items.map((r) => {
                const st = statusPill(r);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.employee ? (
                        <div className="nx-att-who">
                          <div className="nx-att-av">{initials(r.employee.fullName)}</div>
                          <div>
                            <strong>{r.employee.fullName}</strong>
                            <span>{r.employee.employeeCode}</span>
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <strong className="nx-att-shift-title">{r.employee?.position || r.department?.name || '—'}</strong>
                      <span className="nx-att-shift-sub">{r.shiftLabel} · {r.shiftStart}–{r.shiftEnd}</span>
                    </td>
                    <td>
                      <div className={r.punctuality === 'LATE' ? 'nx-att-time warn' : r.checkInTime ? 'nx-att-time ok' : ''}>
                        {timeOnly(r.checkInTime)}
                      </div>
                      {r.punctuality === 'LATE' && r.lateMinutes != null && (
                        <span className="nx-att-tag late">Muộn {r.lateMinutes}p</span>
                      )}
                      {r.punctuality === 'EARLY' && r.earlyMinutes != null && (
                        <span className="nx-att-tag early">Sớm {r.earlyMinutes}p</span>
                      )}
                    </td>
                    <td>{r.status === 'IN_PROGRESS' ? '—' : timeOnly(r.checkOutTime)}</td>
                    <td>{fmtDur(r.workMinutes)}</td>
                    <td className="nx-att-muted">—</td>
                    <td>
                      <span className={`nx-att-st ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="nx-att-detail">
                      <Link to={`/attendance/${r.id}`} onClick={(e) => e.stopPropagation()}>
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="nx-att-pager">
            <div>Hiển thị trang {page}/{totalPages} · {total} bản ghi</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="nx-btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <button type="button" className="nx-btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
