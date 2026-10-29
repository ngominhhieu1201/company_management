import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/attendance.css';

type Row = {
  id: number;
  recordCode: string;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
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
  onTime: number;
  late: number;
  onTimeRate: number | null;
  flagged: number;
  allTimeTotal: number;
};

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
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtDur(mins: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Đủ ${h}h${String(m).padStart(2, '0')}m`;
}
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

export default function AttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [today, setToday] = useState<Row | null>(null);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [punctuality, setPunctuality] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [chip, setChip] = useState('all');

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<'in' | 'out' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params: Record<string, string | number> = {
      page,
      pageSize: 10,
      date: date || undefined!,
    };
    if (q) params.q = q;
    if (departmentId) params.departmentId = Number(departmentId);
    if (chip === 'late' || punctuality === 'LATE') params.punctuality = 'LATE';
    else if (chip === 'ontime' || punctuality === 'ON_TIME') params.punctuality = 'ON_TIME';
    else if (punctuality) params.punctuality = punctuality;
    if (chip === 'flag') params.flagged = '1';

    const [s, list, t] = await Promise.all([
      api.get<Stats>('/attendance/stats', { params: { date } }),
      api.get<{ items: Row[]; total: number; totalPages: number }>('/attendance', { params }),
      api.get('/attendance/today').catch(() => ({ data: null })),
    ]);
    setStats(s.data);
    setItems(list.data.items);
    setTotal(list.data.total);
    setTotalPages(list.data.totalPages);
    setToday(t.data);
  }, [page, date, q, departmentId, punctuality, chip]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
        setError('');
      } catch {
        if (!c) setError('Không tải được lịch sử chấm công');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [load]);

  useEffect(() => {
    api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qDraft]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

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

  async function confirm() {
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
      await load();
    } catch {
      setError('Chấm công thất bại');
    } finally {
      setBusy(false);
    }
  }

  const canIn = user?.employeeId && !today;
  const canOut = today && today.status === 'IN_PROGRESS';

  return (
    <div>
      <div className="nx-att-crumb">
        <span>Quản trị hệ thống</span>
        <span>›</span>
        <span>Lịch sử chấm công</span>
      </div>
      <div className="nx-att-head">
        <h1>Lịch sử chấm công ca làm việc toàn doanh nghiệp</h1>
        <button type="button" className="nx-btn-primary" onClick={() => exportCsv(items)}>
          Xuất báo cáo Excel
        </button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      {user?.employeeId && (
        <div className="nx-att-check">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>Chấm công hôm nay</strong>
              <div style={{ fontSize: '.85rem', color: '#7a8a85' }}>
                {today
                  ? `Vào ${timeOnly(today.checkInTime)} · ${today.status === 'IN_PROGRESS' ? 'Đang trong ca' : `Ra ${timeOnly(today.checkOutTime)}`}`
                  : 'Chưa check-in'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="nx-btn-primary" disabled={!canIn || !!mode} onClick={() => void startCamera('in')}>
                Check-in
              </button>
              <button type="button" className="nx-btn-outline" disabled={!canOut || !!mode} onClick={() => void startCamera('out')}>
                Check-out
              </button>
            </div>
          </div>
          {mode && (
            <div style={{ marginTop: 12 }}>
              {!preview ? (
                <video ref={videoRef} playsInline muted />
              ) : (
                <img src={preview} alt="preview" />
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {!preview && (
                  <button type="button" className="nx-btn-outline" onClick={capture}>
                    Chụp ảnh
                  </button>
                )}
                {preview && (
                  <button type="button" className="nx-btn-primary" disabled={busy} onClick={() => void confirm()}>
                    {busy ? 'Đang gửi…' : 'Xác nhận'}
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  style={{ border: 0, background: 'transparent', fontWeight: 700, color: '#7a8a85' }}
                  onClick={() => {
                    stream?.getTracks().forEach((t) => t.stop());
                    setStream(null);
                    setMode(null);
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stats && (
        <div className="nx-att-kpis">
          <div className="nx-att-kpi on">
            <div className="label">Tỷ lệ đúng giờ</div>
            <div className="value">{stats.onTimeRate != null ? `${stats.onTimeRate}%` : '—'}</div>
            <div style={{ fontSize: '.75rem', color: '#7a8a85' }}>{stats.onTime}/{stats.total} lượt · {stats.date}</div>
          </div>
          <div className="nx-att-kpi late">
            <div className="label">Đi muộn / cần giải trình</div>
            <div className="value">{stats.late} lượt</div>
            <div style={{ fontSize: '.75rem', color: '#7a8a85' }}>Gắn cờ: {stats.flagged}</div>
          </div>
        </div>
      )}

      <div className="nx-att-filters">
        <label className="search">
          <input value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Tìm mã NV, họ tên, phòng ban, #ATT…" />
        </label>
        <input className="nx-att-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
          <option value="">Tất cả phòng ban</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={punctuality} onChange={(e) => { setPunctuality(e.target.value); setChip('all'); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="ON_TIME">Đúng giờ</option>
          <option value="LATE">Đi muộn</option>
          <option value="IN_PROGRESS">Đang trong ca</option>
        </select>
      </div>

      <div className="nx-att-chips">
        {[
          ['all', `Tất cả (${stats?.total ?? 0})`],
          ['ontime', `Đúng giờ (${stats?.onTime ?? 0})`],
          ['late', `Đi muộn (${stats?.late ?? 0})`],
          ['flag', `Cần đối soát (${stats?.flagged ?? 0})`],
        ].map(([k, label]) => (
          <button key={k} type="button" className={`nx-att-chip${chip === k ? ' active' : ''}`} onClick={() => { setChip(k); setPunctuality(''); setPage(1); }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-5 text-center"><Spinner size="sm" animation="border" /></div>
      ) : (
        <div className="nx-att-wrap">
          <table className="nx-att-table">
            <thead>
              <tr>
                <th>Mã bản ghi</th>
                <th>Nhân viên</th>
                <th>Phòng ban</th>
                <th>Ca làm việc</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#7a8a85' }}>Không có bản ghi</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/attendance/${r.id}`)}>
                  <td><span className="nx-att-code">#{r.recordCode}</span></td>
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
                  <td>{r.department ? <span className="nx-att-dept">{r.department.name}</span> : '—'}</td>
                  <td>
                    <strong style={{ display: 'block', fontSize: '.84rem' }}>{r.shiftLabel}</strong>
                    <span style={{ fontSize: '.72rem', color: '#7a8a85' }}>{r.shiftStart} – {r.shiftEnd}</span>
                  </td>
                  <td>
                    <div className={r.punctuality === 'LATE' ? 'nx-att-time warn' : 'nx-att-time ok'}>{timeOnly(r.checkInTime)}</div>
                    <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>
                      {r.punctuality === 'LATE' && r.lateMinutes != null
                        ? `Trễ ${r.lateMinutes} phút`
                        : r.earlyMinutes != null
                          ? `Sớm ${r.earlyMinutes} phút`
                          : ''}
                    </div>
                  </td>
                  <td>
                    {r.status === 'IN_PROGRESS' ? (
                      <span className="nx-att-st prog">ĐANG TRONG CA</span>
                    ) : (
                      <>
                        <div>{timeOnly(r.checkOutTime)}</div>
                        <div style={{ fontSize: '.72rem', color: '#7a8a85' }}>{fmtDur(r.workMinutes)}</div>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`nx-att-st ${r.punctuality === 'LATE' ? 'late' : 'on'}`}>
                      {r.punctuality === 'LATE' ? `ĐI MUỘN (${r.lateMinutes ?? 0}p)` : 'HỢP LỆ / ĐÚNG GIỜ'}
                    </span>
                    {r.flagged && <div style={{ fontSize: '.7rem', color: '#c62828', fontWeight: 700 }}>⚑ Cần đối soát</div>}
                  </td>
                </tr>
              ))}
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
      <div style={{ marginTop: 12 }}>
        <Link to="/attendance" style={{ display: 'none' }} />
      </div>
    </div>
  );
}
