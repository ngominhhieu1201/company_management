import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
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

type TaskRow = {
  id: number;
  taskCode?: string;
  title: string;
  status: string;
  priority: string;
  progress: number;
  startDate?: string | null;
  dueDate: string | null;
  projectName: string | null;
  createdByName?: string;
};

type AttRow = {
  id: number;
  workDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInHint?: string | null;
  checkOutHint?: string | null;
  checkInPhotoKey?: string | null;
  checkOutPhotoKey?: string | null;
  status: string;
  statusLabel?: string;
  credit?: number;
  flagged: boolean;
  onLeave?: boolean;
  leaveCode?: string | null;
};

type LeaveRow = {
  id: number;
  leaveCode?: string;
  leaveType?: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  reason: string | null;
  attachmentName?: string | null;
  handoverName?: string | null;
  handoverPosition?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
};

type Detail = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  departmentLocation: string | null;
  position: string;
  hireDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationalId?: string | null;
  nationalIdMasked: string | null;
  permanentAddress: string | null;
  temporaryAddress: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  contractType: string | null;
  photoKey: string | null;
  status: string;
  seniority: string | null;
  yearsOfService: number | null;
  projects: string[];
  account: Account;
  todayPresence?: { kind: string; label: string };
  attendanceToday: {
    id: number | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    present: boolean;
    hasPhoto: boolean;
    status: string | null;
  };
  yesterdayCheckout: string | null;
  tasks: TaskRow[];
  attendanceHistory: AttRow[];
  leaveHistory: LeaveRow[];
  recentLeave: {
    id: number;
    leaveTypeLabel: string;
    daysCount: number;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
  metrics: {
    label: string;
    attendanceDays: number;
    attendanceExpected: number;
    attendancePct: number;
    attendanceOnTime: number;
    attendanceValid: number;
    taskTotal: number;
    taskDone: number;
    taskRunning: number;
    taskProgressPct: number;
    leaveUsed: number;
    leaveQuota: number;
    leaveRemaining: number;
    leaveRemainingPct: number;
    monthHoursEstimate: number;
    monthHoursTarget: number;
  };
};

function weekdayVi(iso: string) {
  const days = [
    'Chủ nhật',
    'Thứ hai',
    'Thứ ba',
    'Thứ tư',
    'Thứ năm',
    'Thứ sáu',
    'Thứ bảy',
  ];
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toISOString().slice(0, 10);
  const prefix = iso === today ? 'Hôm nay — ' : '';
  return `${prefix}${days[d.getDay()]}`;
}

function priShort(p: string) {
  if (p === 'URGENT') return 'P0 · Khẩn';
  if (p === 'HIGH') return 'P1 · Cao';
  if (p === 'LOW') return 'P3 · Thấp';
  return 'P2 · TB';
}

function leaveStatusLabel(s: string) {
  if (s === 'APPROVED') return 'ĐÃ DUYỆT';
  if (s === 'PENDING') return 'CHỜ DUYỆT';
  if (s === 'REJECTED') return 'TỪ CHỐI';
  if (s === 'CANCELLED') return 'ĐÃ HỦY';
  return s;
}

function dueHint(due: string | null) {
  if (!due) return null;
  const today = new Date().toISOString().slice(0, 10);
  const a = new Date(today + 'T00:00:00').getTime();
  const b = new Date(due + 'T00:00:00').getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff > 0 && diff <= 7) return `Còn ${diff} ngày`;
  if (diff < 0) return `Quá ${Math.abs(diff)} ngày`;
  return null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, day] = iso.slice(0, 10).split('-');
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

function genderLabel(g: string | null) {
  if (g === 'MALE') return 'Nam';
  if (g === 'FEMALE') return 'Nữ';
  if (g === 'OTHER') return 'Khác';
  return '—';
}

function contractLabel(c: string | null) {
  if (c === 'PROBATION') return 'Thử việc';
  if (c === 'OFFICIAL') return 'Chính thức có thời hạn';
  if (c === 'INDEFINITE') return 'Chính thức vô thời hạn';
  if (c === 'INTERN') return 'Thực tập';
  return c || '—';
}

function statusTask(s: string) {
  if (s === 'DONE') return 'DONE';
  if (s === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (s === 'REVIEW') return 'REVIEW';
  return 'TODO';
}

function exportProfile(d: Detail) {
  const lines = [
    `Họ tên,${d.fullName}`,
    `Mã NV,${d.employeeCode}`,
    `Email,${d.email}`,
    `Điện thoại,${d.phone}`,
    `Phòng ban,${d.departmentName || ''}`,
    `Chức danh,${d.position}`,
    `Ngày vào,${d.hireDate || ''}`,
    `Hợp đồng,${d.contractType || ''}`,
    `Quản lý,${d.managerName || ''}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hoso-${d.employeeCode}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = 'info' | 'tasks' | 'attendance' | 'leave';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isManager = user?.role === 'MANAGER';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/employees/${id}`);
      setDetail(data);
      setError('');
    } catch {
      setError('Không tải được hồ sơ nhân sự');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!detail) {
    return (
      <Alert variant="danger">
        {error || 'Không tìm thấy nhân sự'}{' '}
        <Link to="/employees">Quay lại</Link>
      </Alert>
    );
  }

  const photoUrl = detail.photoKey
    ? `${apiBase}/employees/photo/${detail.photoKey}`
    : null;
  const accActive = detail.account.linked && !detail.account.locked;
  const m = detail.metrics;

  return (
    <div className="nx-ed nx-ed-view">
      <div className="nx-ed-top">
        <div>
          <nav className="nx-ed-crumb">
            <span>{isManager ? 'Quản trị quản lý' : 'Quản trị hệ thống'}</span>
            <span className="sep">›</span>
            <span>Phân hệ nhân sự</span>
            <span className="sep">›</span>
            <Link to="/employees">Danh sách nhân viên</Link>
            <span className="sep">›</span>
            <span className="here">{detail.employeeCode}</span>
          </nav>
        </div>
        <div className="nx-ed-actions">
          <button
            type="button"
            className="nx-btn-outline"
            onClick={() => exportProfile(detail)}
          >
            Xuất sơ yếu lý lịch
          </button>
          {canManage && (
            <Link
              to={`/employees/${detail.id}/edit`}
              className="nx-btn-primary"
            >
              Chỉnh sửa thông tin
            </Link>
          )}
          {!canManage && user?.employeeId === detail.id && (
            <Link
              to={`/employees/${detail.id}/edit`}
              className="nx-btn-primary"
            >
              Cập nhật thông tin liên hệ
            </Link>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <section className="nx-ed-hero">
        <div className="nx-ed-hero-main">
          <div className="nx-ed-avatar lg">
            {photoUrl ? (
              <img src={photoUrl} alt={detail.fullName} />
            ) : (
              initials(detail.fullName)
            )}
          </div>
          <div>
            <div className="nx-ed-hero-name">
              <h1>{detail.fullName}</h1>
              <span className="nx-ed-code">{detail.employeeCode}</span>
              {detail.account.linked && (
                <span
                  className={`nx-ed-acc ${accActive ? 'on' : 'off'}`}
                >
                  TÀI KHOẢN: {accActive ? 'ACTIVE' : 'LOCKED'}
                </span>
              )}
            </div>
            <p className="nx-ed-hero-role">
              {detail.position || '—'}
              {detail.departmentName && (
                <>
                  {' · '}
                  {detail.departmentName}
                  {detail.departmentCode
                    ? ` (${detail.departmentCode})`
                    : ''}
                </>
              )}
            </p>
            <div className="nx-ed-hero-meta">
              <span>{detail.email || '—'}</span>
              <span>{detail.phone || '—'}</span>
              <span>
                Vào làm {fmtDate(detail.hireDate)}
                {detail.yearsOfService != null
                  ? ` · ${detail.yearsOfService} năm thâm niên`
                  : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="nx-ed-hero-kpis">
          <div className="nx-ed-hk">
            <div className="v">{m.taskTotal} tasks</div>
            <div className="l">
              {m.taskDone} hoàn thành · {m.taskRunning} đang chạy
            </div>
          </div>
          <div className="nx-ed-hk">
            <div className="v">{m.attendancePct}%</div>
            <div className="l">
              Đúng giờ {m.attendanceOnTime}/{m.attendanceValid} ca hợp lệ
            </div>
          </div>
          <div className="nx-ed-hk">
            <div className="v">
              {m.leaveRemaining} / {m.leaveQuota} ngày
            </div>
            <div className="l">Đã dùng {m.leaveUsed} ngày phép năm</div>
          </div>
        </div>
      </section>

      <div className="nx-ed-tabs">
        {(
          [
            ['info', `Thông tin cá nhân`],
            ['tasks', `Lịch sử công việc (${m.taskTotal})`],
            ['attendance', `Lịch sử chấm công (${detail.attendanceHistory.length})`],
            ['leave', `Lịch sử nghỉ phép (${detail.leaveHistory.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? 'on' : undefined}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`nx-ed-body${tab !== 'info' ? ' full' : ''}`}>
        <div className="nx-ed-main">
          {tab === 'info' && (
            <div className="nx-ed-info-grid">
              <section className="nx-ed-card">
                <h2>Thông tin nhân thân</h2>
                <dl className="nx-ed-dl">
                  <div>
                    <dt>Họ và tên</dt>
                    <dd>{detail.fullName}</dd>
                  </div>
                  <div>
                    <dt>Giới tính</dt>
                    <dd>{genderLabel(detail.gender)}</dd>
                  </div>
                  <div>
                    <dt>Ngày sinh</dt>
                    <dd>{fmtDate(detail.dateOfBirth)}</dd>
                  </div>
                  <div>
                    <dt>CCCD / Định danh</dt>
                    <dd>{detail.nationalIdMasked || '—'}</dd>
                  </div>
                  <div className="full">
                    <dt>Địa chỉ thường trú</dt>
                    <dd>{detail.permanentAddress || '—'}</dd>
                  </div>
                  <div className="full">
                    <dt>Địa chỉ tạm trú</dt>
                    <dd>{detail.temporaryAddress || '—'}</dd>
                  </div>
                </dl>
              </section>
              <section className="nx-ed-card">
                <h2>Tổ chức &amp; hợp đồng</h2>
                <dl className="nx-ed-dl">
                  <div>
                    <dt>Phòng ban</dt>
                    <dd>
                      {detail.departmentName || '—'}
                      {detail.departmentCode
                        ? ` (${detail.departmentCode})`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Chức danh</dt>
                    <dd>{detail.position || '—'}</dd>
                  </div>
                  <div>
                    <dt>Quản lý trực tiếp</dt>
                    <dd>{detail.managerName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Loại hợp đồng</dt>
                    <dd>{contractLabel(detail.contractType)}</dd>
                  </div>
                  <div>
                    <dt>Ngày bắt đầu</dt>
                    <dd>{fmtDate(detail.hireDate)}</dd>
                  </div>
                  <div>
                    <dt>Địa điểm làm việc</dt>
                    <dd>{detail.departmentLocation || '—'}</dd>
                  </div>
                </dl>
              </section>
              {detail.tasks.length > 0 && (
                <section className="nx-ed-card full">
                  <h2>Công việc gần đây</h2>
                  <ul className="nx-ed-tasklist">
                    {detail.tasks.slice(0, 4).map((t) => (
                      <li key={t.id}>
                        <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                        <div className="nx-progress">
                          <div className="nx-progress-bar">
                            <span style={{ width: `${t.progress}%` }} />
                          </div>
                          <em>{t.progress}%</em>
                        </div>
                        <span className={`nx-ed-st ${statusTask(t.status)}`}>
                          {t.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className="nx-ed-more"
                    to={`/tasks?assigneeId=${detail.id}`}
                  >
                    Xem toàn bộ {m.taskTotal} task của nhân sự trên Kanban
                  </Link>
                </section>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <section className="nx-ed-card">
              <h2>Lịch sử công việc được giao</h2>
              {detail.tasks.length === 0 ? (
                <div className="nx-empty">Chưa có công việc được giao.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="nx-ed-table nx-ed-rich">
                    <thead>
                      <tr>
                        <th>Mã &amp; tên công việc</th>
                        <th>Dự án</th>
                        <th>Ưu tiên</th>
                        <th>Tiến độ</th>
                        <th>Thời hạn</th>
                        <th>Người giao</th>
                        <th>Trạng thái</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.tasks.map((t) => {
                        const hint = dueHint(t.dueDate);
                        return (
                          <tr key={t.id}>
                            <td>
                              <div className="nx-ed-code-title">
                                <span className="code">
                                  {t.taskCode || `TSK-${t.id}`}
                                </span>
                                <strong>{t.title}</strong>
                              </div>
                            </td>
                            <td>{t.projectName || '—'}</td>
                            <td>
                              <span
                                className={`nx-ed-pri ${
                                  t.priority === 'URGENT'
                                    ? 'urgent'
                                    : t.priority === 'HIGH'
                                      ? 'high'
                                      : 'mid'
                                }`}
                              >
                                {priShort(t.priority)}
                              </span>
                            </td>
                            <td>
                              <div className="nx-progress">
                                <div className="nx-progress-bar">
                                  <span style={{ width: `${t.progress}%` }} />
                                </div>
                                <em>{t.progress}%</em>
                              </div>
                            </td>
                            <td>
                              <div className="nx-ed-due">
                                <strong>{fmtDate(t.dueDate)}</strong>
                                {hint && <small>{hint}</small>}
                              </div>
                            </td>
                            <td>{t.createdByName || '—'}</td>
                            <td>
                              <span className={`nx-ed-st ${statusTask(t.status)}`}>
                                {t.status}
                              </span>
                            </td>
                            <td>
                              <Link
                                to={`/tasks/${t.id}`}
                                className="nx-ed-more"
                                style={{ margin: 0 }}
                              >
                                Xem
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="nx-ed-tab-foot">
                Hiển thị {detail.tasks.length} / {m.taskTotal} công việc
                <Link to={`/tasks?assigneeId=${detail.id}`}>
                  Mở trên bảng Kanban
                </Link>
              </div>
            </section>
          )}

          {tab === 'attendance' && (
            <section className="nx-ed-card">
              <div className="nx-ed-sec-head">
                <h2 style={{ margin: 0 }}>Nhật ký chấm công chi tiết</h2>
                <div className="nx-ed-legend">
                  <span>Ca hành chính 08:30–17:30</span>
                  <span>· Ảnh lưu trên máy chủ</span>
                </div>
              </div>
              {detail.attendanceHistory.length === 0 ? (
                <div className="nx-empty">Chưa có bản ghi chấm công.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="nx-ed-table nx-ed-rich">
                    <thead>
                      <tr>
                        <th>Ngày chấm công</th>
                        <th>Ca làm việc</th>
                        <th>Check-in</th>
                        <th>Ảnh vào</th>
                        <th>Check-out</th>
                        <th>Ảnh ra</th>
                        <th>Quy đổi công</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.attendanceHistory.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <Link to={`/attendance/${r.id}`}>
                              <strong>{fmtDate(r.workDate)}</strong>
                            </Link>
                            <div className="muted">{weekdayVi(r.workDate)}</div>
                          </td>
                          <td>
                            {r.onLeave ? (
                              <span className="muted">
                                Nghỉ · {r.leaveCode || 'có đơn'}
                              </span>
                            ) : (
                              <>
                                <strong>Ca hành chính</strong>
                                <div className="muted">08:30 – 17:30</div>
                              </>
                            )}
                          </td>
                          <td>
                            <strong>{r.checkInTime || '—'}</strong>
                            {r.checkInHint && (
                              <div className="muted">{r.checkInHint}</div>
                            )}
                          </td>
                          <td>
                            {r.checkInPhotoKey ? (
                              <a
                                className="nx-ed-photo"
                                href={`${apiBase}/attendance/photo/${r.checkInPhotoKey}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Xem ảnh
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <strong>{r.checkOutTime || '—'}</strong>
                            {r.checkOutHint && (
                              <div className="muted">{r.checkOutHint}</div>
                            )}
                          </td>
                          <td>
                            {r.checkOutPhotoKey ? (
                              <a
                                className="nx-ed-photo"
                                href={`${apiBase}/attendance/photo/${r.checkOutPhotoKey}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Xem ảnh
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {r.credit != null ? `${r.credit} công` : '—'}
                          </td>
                          <td>
                            <span
                              className={`nx-ed-st ${
                                r.onLeave
                                  ? 'REVIEW'
                                  : r.statusLabel === 'Đi muộn'
                                    ? 'TODO'
                                    : 'DONE'
                              }`}
                            >
                              {r.statusLabel || r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="nx-ed-tab-foot">
                Hiển thị {detail.attendanceHistory.length} bản ghi gần nhất
                <Link to="/attendance">Xem toàn bộ chấm công</Link>
              </div>
            </section>
          )}

          {tab === 'leave' && (
            <section className="nx-ed-card">
              <h2>Lịch sử nghỉ phép</h2>
              {detail.leaveHistory.length === 0 ? (
                <div className="nx-empty">Chưa có đơn nghỉ phép.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="nx-ed-table nx-ed-rich">
                    <thead>
                      <tr>
                        <th>Mã đơn &amp; loại</th>
                        <th>Thời gian nghỉ</th>
                        <th>Số ngày</th>
                        <th>Lý do &amp; đính kèm</th>
                        <th>Bàn giao</th>
                        <th>Người phê duyệt</th>
                        <th>Trạng thái</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.leaveHistory.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <div className="nx-ed-code-title">
                              <span className="code">
                                #{l.leaveCode || l.id}
                              </span>
                              <strong>{l.leaveTypeLabel}</strong>
                            </div>
                          </td>
                          <td>
                            {fmtDate(l.startDate)}
                            {l.startDate !== l.endDate
                              ? ` – ${fmtDate(l.endDate)}`
                              : ''}
                          </td>
                          <td>{l.daysCount} ngày</td>
                          <td>
                            <div className="nx-ed-reason">
                              {l.reason || '—'}
                              {l.attachmentName && (
                                <small>{l.attachmentName}</small>
                              )}
                            </div>
                          </td>
                          <td>
                            {l.handoverName ? (
                              <>
                                <strong>{l.handoverName}</strong>
                                {l.handoverPosition && (
                                  <div className="muted">
                                    {l.handoverPosition}
                                  </div>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {l.reviewerName || '—'}
                            {l.reviewedAt && (
                              <div className="muted">
                                {fmtDate(String(l.reviewedAt).slice(0, 10))}
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`nx-ed-st ${
                                l.status === 'APPROVED'
                                  ? 'DONE'
                                  : l.status === 'PENDING'
                                    ? 'REVIEW'
                                    : 'TODO'
                              }`}
                            >
                              {leaveStatusLabel(l.status)}
                            </span>
                          </td>
                          <td>
                            <Link to={`/leave/${l.id}`} className="nx-ed-more" style={{ margin: 0 }}>
                              Xem
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="nx-ed-tab-foot">
                Hiển thị {detail.leaveHistory.length} đơn đã ghi nhận
                {canManage && <Link to="/leave">Quản lý nghỉ phép</Link>}
              </div>
            </section>
          )}
        </div>

        {tab === 'info' && (
        <aside className="nx-ed-side">
          <section className="nx-ed-card">
            <h3>Chấm công hôm nay</h3>
            <div className="nx-ed-att-today">
              <div className="row">
                <span>Giờ vào</span>
                <strong>
                  {detail.attendanceToday.checkInTime || '—'}
                </strong>
              </div>
              <div className="row">
                <span>Trạng thái</span>
                <strong
                  className={
                    detail.attendanceToday.present ? 'ok' : 'muted'
                  }
                >
                  {detail.attendanceToday.present
                    ? 'CÓ MẶT'
                    : detail.todayPresence?.label || 'CHƯA CHẤM'}
                </strong>
              </div>
              <div className="row">
                <span>Ảnh check-in</span>
                <strong>
                  {detail.attendanceToday.hasPhoto
                    ? 'Đã lưu'
                    : 'Chưa có'}
                </strong>
              </div>
              <div className="row">
                <span>Ra hôm qua</span>
                <strong>{detail.yesterdayCheckout || '—'}</strong>
              </div>
              <div className="row">
                <span>Giờ tháng (ước tính)</span>
                <strong>
                  {m.monthHoursEstimate} / {m.monthHoursTarget}h
                </strong>
              </div>
            </div>
          </section>

          <section className="nx-ed-card">
            <h3>Hạn mức nghỉ phép {new Date().getFullYear()}</h3>
            <div className="nx-ed-leave-quota">
              <div className="nums">
                <strong>{m.leaveRemaining}</strong>
                <span>/ {m.leaveQuota} ngày còn lại</span>
              </div>
              <div className="bar">
                <i
                  style={{
                    width: `${Math.min(100, m.leaveRemainingPct)}%`,
                  }}
                />
              </div>
              {detail.recentLeave && (
                <p className="recent">
                  Gần nhất: {detail.recentLeave.leaveTypeLabel} —{' '}
                  {detail.recentLeave.daysCount} ngày (
                  {fmtDate(detail.recentLeave.startDate)})
                </p>
              )}
              {canManage && (
                <Link to="/leave" className="nx-ed-more">
                  Chuyển sang Quản lý nghỉ phép
                </Link>
              )}
            </div>
          </section>

          {detail.projects.length > 0 && (
            <section className="nx-ed-card">
              <h3>Dự án tham gia</h3>
              <div className="nx-ed-tags">
                {detail.projects.map((p) => (
                  <span key={p}>{p}</span>
                ))}
              </div>
            </section>
          )}
        </aside>
        )}
      </div>
    </div>
  );
}
