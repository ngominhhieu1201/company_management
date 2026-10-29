import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Spinner } from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/employee-home.css';

type AttendanceBlock = {
  checkedIn: number;
  onTime: number;
  late: number;
  notCheckedIn: number;
  onTimePct: number;
  latePct: number;
  notCheckedInPct: number;
  avgCheckIn?: string | null;
};

type LeaveItem = {
  id: number;
  employeeName: string;
  employeePosition?: string | null;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  urgency?: string;
};

type TaskItem = {
  id: number;
  title: string;
  assigneeName: string;
  assigneePosition?: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  progress: number;
};

type ActionItem = {
  id: string;
  kind: string;
  label: string;
  href: string;
  dueHint: string | null;
};

type AdminStats = {
  role: string;
  employees: number;
  workingToday: number;
  workingPct: number;
  openTasks: number;
  dueSoon: number;
  pendingLeave: number;
  attendance: AttendanceBlock;
  pendingLeaveRequests: LeaveItem[];
  activeTasks: TaskItem[];
  tasksByStatus?: Record<string, number>;
};

type EmployeePriorityTask = {
  id: number;
  taskCode?: string;
  title: string;
  priority: string;
  status: string;
  progress: number;
  dueDate: string | null;
  startDate?: string | null;
};

type EmployeeLeaveItem = {
  id: number;
  leaveCode?: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  daysCount?: number;
  reason?: string | null;
  status: string;
};

type EmployeeAttendanceToday = {
  id?: number;
  status: string;
  checkedIn?: boolean;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workedMinutes?: number;
  shiftLabel?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
};

type EmployeeStats = {
  role: 'EMPLOYEE';
  employeeName: string;
  employeeCode?: string;
  position?: string | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  openTasks: number;
  highPriorityTasks: number;
  dueSoon: number;
  tasksByStatus?: Record<string, number>;
  priorityTasks: EmployeePriorityTask[];
  monthPresent: number;
  monthWorkdays: number;
  attendanceRate: number;
  leavePending: number;
  leaveRemaining: number;
  annualQuota?: number;
  annualUsed?: number;
  leavePendingItems: EmployeeLeaveItem[];
  attendanceToday: EmployeeAttendanceToday;
};

type ManagerStats = {
  role: 'MANAGER';
  managerName: string;
  managerPosition: string;
  departmentName: string;
  employees: number;
  headcountTarget: number | null;
  workingToday: number;
  workingPct: number;
  openTasks: number;
  inProgressCount: number;
  needReviewCount: number;
  dueSoon: number;
  pendingLeave: number;
  onTime: number;
  late: number;
  onTimePct: number;
  attendance: AttendanceBlock;
  pendingLeaveRequests: LeaveItem[];
  activeTasks: TaskItem[];
  inProgressTasks: TaskItem[];
  reviewTasks: TaskItem[];
  actionItems: ActionItem[];
  tasksByStatus?: Record<string, number>;
};

function greetingForHour(h: number) {
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatViDate(d: Date) {
  const days = [
    'Chủ nhật',
    'Thứ hai',
    'Thứ ba',
    'Thứ tư',
    'Thứ năm',
    'Thứ sáu',
    'Thứ bảy',
  ];
  return `${days[d.getDay()].toUpperCase()}, ${d.getDate()} THÁNG ${d.getMonth() + 1}`;
}

function firstName(username: string) {
  const parts = username.trim().split(/[\s._@-]+/).filter(Boolean);
  const raw = parts[parts.length - 1] || username;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function employeeFirstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const raw = parts[parts.length - 1] || fullName;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function timeOnly(iso: string | null | undefined) {
  if (!iso) return '—';
  if (/^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatWorkedMinutes(mins?: number | null) {
  if (mins == null || mins < 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatRate(rate: number) {
  if (!Number.isFinite(rate)) return '—';
  return `${Math.round(rate)}%`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateRange(start: string, end: string) {
  const fmt = (s: string) => {
    const [, m, d] = s.split('-');
    return `${d}/${m}`;
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDue(due: string | null) {
  if (!due) return '—';
  const today = new Date().toISOString().slice(0, 10);
  if (due === today) return 'Hôm nay';
  return formatDateRange(due, due);
}

function priorityClass(p: string) {
  if (p === 'URGENT') return 'urgent';
  if (p === 'HIGH') return 'high';
  if (p === 'LOW') return 'low';
  return 'medium';
}

function priorityLabel(p: string) {
  if (p === 'URGENT') return 'P0 KHẨN CẤP';
  if (p === 'HIGH') return 'P1 ƯU TIÊN CAO';
  if (p === 'LOW') return 'P3 THẤP';
  return 'P2 TRUNG BÌNH';
}

function statusLabel(s: string, progress: number) {
  if (s === 'REVIEW') return 'Cần duyệt';
  if (s === 'DONE') return 'Hoàn thành';
  if (s === 'TODO') return 'Chưa bắt đầu';
  return `Đang làm ${progress}%`;
}

function Donut({
  onTime,
  late,
  notCheckedIn,
  total,
}: {
  onTime: number;
  late: number;
  notCheckedIn: number;
  total: number;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const safe = Math.max(total, 1);
  const a = (onTime / safe) * c;
  const b = (late / safe) * c;
  const d = (notCheckedIn / safe) * c;
  return (
    <div className="nx-donut-wrap">
      <svg viewBox="0 0 140 140">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#eef2f0"
          strokeWidth="14"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#004036"
          strokeWidth="14"
          strokeDasharray={`${a} ${c - a}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#f0a202"
          strokeWidth="14"
          strokeDasharray={`${b} ${c - b}`}
          strokeDashoffset={-a}
          strokeLinecap="butt"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#cfd8d4"
          strokeWidth="14"
          strokeDasharray={`${d} ${c - d}`}
          strokeDashoffset={-(a + b)}
          strokeLinecap="butt"
        />
      </svg>
      <div className="nx-donut-center">
        <strong>{onTime + late}</strong>
        <span>Đã chấm công</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const { data } = await api.get('/dashboard');
      setStats(data);
      setError('');
    } catch {
      setError('Không tải được dashboard');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const now = useMemo(() => new Date(), []);

  async function reviewLeave(id: number, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.patch(`/leave/${id}/review`, { decision });
      await load();
    } catch {
      setError('Phê duyệt thất bại');
    } finally {
      setBusyId(null);
    }
  }

  if (error && !stats) return <Alert variant="danger">{error}</Alert>;
  if (!stats) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (stats.role === 'MANAGER') {
    return (
      <ManagerDashboard
        stats={stats as unknown as ManagerStats}
        error={error}
        busyId={busyId}
        now={now}
        onReviewLeave={reviewLeave}
      />
    );
  }

  if (stats.role === 'EMPLOYEE') {
    return (
      <EmployeeDashboard
        stats={stats as unknown as EmployeeStats}
        error={error}
        now={now}
      />
    );
  }

  const isAdmin = stats.role === 'ADMIN' && 'attendance' in stats;
  if (!isAdmin) {
    return <SimpleDashboard stats={stats} username={user?.username} />;
  }

  const admin = stats as unknown as AdminStats;
  const att = admin.attendance;
  const staffTotal = Math.max(admin.employees, 1);

  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="nx-dash-head">
        <div>
          <div className="nx-dash-kicker">{formatViDate(now)}</div>
          <h1>
            {greetingForHour(now.getHours())}, {firstName(user?.username || 'Admin')}!
          </h1>
          <p>Đây là tổng quan hoạt động công ty hôm nay.</p>
        </div>
        <Link to="/employees" className="nx-btn-primary">
          + Thêm nhân sự
        </Link>
      </div>

      <div className="nx-kpi-grid">
        <div className="nx-kpi">
          <div className="nx-kpi-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Tổng nhân sự</div>
            <div className="nx-kpi-value">{admin.employees}</div>
            <div className="nx-kpi-hint up">Đang hoạt động</div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Đang làm việc</div>
            <div className="nx-kpi-value">{admin.workingToday}</div>
            <div className="nx-kpi-hint">
              {admin.workingPct}% trên tổng số
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h16M7 16V8m5 8V4m5 12v-6" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Công việc đang mở</div>
            <div className="nx-kpi-value">{admin.openTasks}</div>
            <div className="nx-kpi-hint">
              {admin.dueSoon} việc sắp đến hạn
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Đơn chờ duyệt</div>
            <div className="nx-kpi-value">
              {String(admin.pendingLeave).padStart(2, '0')}
            </div>
            <div className="nx-kpi-hint">Cần xử lý hôm nay</div>
          </div>
        </div>
      </div>

      <div className="nx-mid-grid">
        <section className="nx-panel">
          <h2 className="nx-panel-title">Tình hình chấm công</h2>
          <div className="nx-att-body">
            <Donut
              onTime={att.onTime}
              late={att.late}
              notCheckedIn={att.notCheckedIn}
              total={staffTotal}
            />
            <ul className="nx-legend">
              <li>
                <span className="swatch" style={{ background: '#004036' }} />
                <span className="name">Đúng giờ</span>
                <span className="meta">
                  {att.onTime}/{att.onTimePct}%
                </span>
              </li>
              <li>
                <span className="swatch" style={{ background: '#f0a202' }} />
                <span className="name">Đi muộn</span>
                <span className="meta">
                  {att.late}/{att.latePct}%
                </span>
              </li>
              <li>
                <span className="swatch" style={{ background: '#cfd8d4' }} />
                <span className="name">Chưa chấm công</span>
                <span className="meta">
                  {att.notCheckedIn}/{att.notCheckedInPct}%
                </span>
              </li>
            </ul>
          </div>
          <div className="nx-att-foot">
            Giờ chấm công trung bình hôm nay:{' '}
            <strong>{att.avgCheckIn ?? '—'}</strong>
          </div>
        </section>

        <section className="nx-panel">
          <h2 className="nx-panel-title">Đơn nghỉ phép chờ duyệt</h2>
          <div className="nx-leave-list">
            {admin.pendingLeaveRequests.length === 0 && (
              <div className="nx-empty">Không có đơn chờ duyệt.</div>
            )}
            {admin.pendingLeaveRequests.map((row) => (
              <div className="nx-leave-row" key={row.id}>
                <div className="nx-leave-avatar">{initials(row.employeeName)}</div>
                <div className="nx-leave-meta">
                  <strong>{row.employeeName}</strong>
                  <span>
                    {formatDateRange(row.startDate, row.endDate)} ·{' '}
                    {row.leaveTypeLabel}
                  </span>
                </div>
                <div className="nx-leave-actions">
                  <button
                    type="button"
                    className="nx-act ok"
                    disabled={busyId === row.id}
                    title="Duyệt"
                    onClick={() => void reviewLeave(row.id, 'APPROVED')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="nx-act no"
                    disabled={busyId === row.id}
                    title="Từ chối"
                    onClick={() => void reviewLeave(row.id, 'REJECTED')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="nx-panel nx-tasks-panel">
        <h2 className="nx-panel-title">Công việc đang tiến hành</h2>
        {admin.activeTasks.length === 0 ? (
          <div className="nx-empty">Chưa có công việc đang mở.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="nx-tasks-table">
              <thead>
                <tr>
                  <th>Công việc</th>
                  <th>Người thực hiện</th>
                  <th>Hạn chót</th>
                  <th>Tiến độ</th>
                  <th>Ưu tiên</th>
                </tr>
              </thead>
              <tbody>
                {admin.activeTasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                    </td>
                    <td>{t.assigneeName}</td>
                    <td>
                      {t.dueDate
                        ? formatDateRange(t.dueDate, t.dueDate)
                        : '—'}
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
                      <span className={`nx-prio ${priorityClass(t.priority)}`}>
                        {priorityLabel(t.priority)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EmployeeDashboard({
  stats,
  error,
  now,
}: {
  stats: EmployeeStats;
  error: string;
  now: Date;
}) {
  const att = stats.attendanceToday ?? { status: 'ABSENT' };
  const shiftStatus = att.status;
  const checkedIn =
    att.checkedIn === true ||
    shiftStatus === 'IN_PROGRESS' ||
    shiftStatus === 'COMPLETED';
  const canCheckOut = shiftStatus === 'IN_PROGRESS';
  const pendingLeaves = stats.leavePendingItems.filter(
    (row) => row.status === 'PENDING',
  );

  let shiftBadge = { cls: '', label: 'Chưa chấm công' };
  if (shiftStatus === 'IN_PROGRESS') {
    shiftBadge = { cls: 'on', label: 'Đang trong ca' };
  } else if (shiftStatus === 'COMPLETED') {
    shiftBadge = { cls: 'done', label: 'Hoàn tất ca' };
  } else if (checkedIn) {
    shiftBadge = { cls: 'on', label: 'Đã check-in' };
  }

  const checkCta = canCheckOut
    ? { to: '/attendance', label: 'Check-out' }
    : { to: '/attendance', label: 'Check-in' };

  return (
    <div className="nx-emp">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="nx-emp-head">
        <div>
          <div className="nx-dash-kicker">{formatViDate(now)}</div>
          <h1>
            {greetingForHour(now.getHours())},{' '}
            {employeeFirstName(stats.employeeName)}!
          </h1>
          <p className="nx-emp-sub">
            {stats.position && <strong>{stats.position}</strong>}
            {stats.position && stats.departmentName && ' · '}
            {stats.departmentName}
            {stats.employeeCode && (
              <>
                {' '}
                · <span>Mã NV {stats.employeeCode}</span>
              </>
            )}
          </p>
        </div>
        <div className="nx-emp-actions">
          <Link to="/attendance" className="nx-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4.5l3 1.5" />
            </svg>
            {canCheckOut ? 'Check-out' : 'Check-in'}
          </Link>
          <Link to="/tasks" className="nx-btn-outline">
            Công việc của tôi
          </Link>
        </div>
      </div>

      <div className="nx-kpi-grid">
        <div className="nx-kpi">
          <div className="nx-kpi-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4.5l3 1.5" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Chấm công tháng</div>
            <div className="nx-kpi-value">
              {stats.monthPresent}
              <span className="nx-emp-kpi-sub"> / {stats.monthWorkdays}</span>
            </div>
            <div className="nx-kpi-hint up">
              Tỷ lệ {formatRate(stats.attendanceRate)}
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="m8 12 2.5 2.5L16 9" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Công việc</div>
            <div className="nx-kpi-value">{stats.openTasks}</div>
            <div className="nx-kpi-hint">
              {stats.highPriorityTasks} ưu tiên cao
              {stats.dueSoon > 0 ? ` · ${stats.dueSoon} sắp hạn` : ''}
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Phép còn</div>
            <div className="nx-kpi-value">{stats.leaveRemaining}</div>
            <div className="nx-kpi-hint">
              {stats.leavePending > 0
                ? `${stats.leavePending} đơn chờ duyệt`
                : 'ngày phép khả dụng'}
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="8" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Thời gian trong ca</div>
            <div className="nx-kpi-value" style={{ fontSize: '1.35rem' }}>
              {formatWorkedMinutes(att.workedMinutes)}
            </div>
            <div className="nx-kpi-hint">hôm nay</div>
          </div>
        </div>
      </div>

      <div className="nx-emp-body">
        <div className="nx-emp-main">
          <section className="nx-emp-shift">
            <div className="nx-emp-shift-top">
              <div>
                <h2>Ca làm việc hôm nay</h2>
                <div className="nx-emp-shift-label">
                  {att.shiftLabel || 'Ca hành chính'}
                </div>
              </div>
              <span className={`nx-emp-shift-badge ${shiftBadge.cls}`}>
                {shiftBadge.label}
              </span>
            </div>
            <div className="nx-emp-shift-times">
              <div>
                <span>Bắt đầu ca</span>
                <strong>{timeOnly(att.shiftStart)}</strong>
              </div>
              <div>
                <span>Kết thúc ca</span>
                <strong>{timeOnly(att.shiftEnd)}</strong>
              </div>
              <div>
                <span>Giờ vào</span>
                <strong>{timeOnly(att.checkInTime)}</strong>
              </div>
            </div>
            <div className="nx-emp-shift-foot">
              <small>
                {checkedIn ? (
                  <>
                    Đã check-in lúc <strong>{timeOnly(att.checkInTime)}</strong>
                    {att.checkOutTime && (
                      <>
                        {' '}
                        · Ra <strong>{timeOnly(att.checkOutTime)}</strong>
                      </>
                    )}
                  </>
                ) : (
                  'Bạn chưa check-in ca hôm nay.'
                )}
              </small>
              <Link to={checkCta.to} className="nx-emp-btn-light">
                {checkCta.label}
              </Link>
            </div>
          </section>

          <section className="nx-panel">
            <div className="nx-emp-tasks-head">
              <h2 className="nx-panel-title" style={{ margin: 0 }}>
                Công việc ưu tiên
              </h2>
              <Link to="/tasks">Xem tất cả →</Link>
            </div>
            {stats.priorityTasks.length === 0 ? (
              <div className="nx-empty">Không có công việc ưu tiên.</div>
            ) : (
              <div className="nx-emp-task-list">
                {stats.priorityTasks.map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className="nx-emp-task-row"
                  >
                    <div className="nx-emp-task-top">
                      <div>
                        {t.taskCode && (
                          <div className="nx-emp-task-code">{t.taskCode}</div>
                        )}
                        <strong>{t.title}</strong>
                      </div>
                      <span className={`nx-prio ${priorityClass(t.priority)}`}>
                        {priorityLabel(t.priority)}
                      </span>
                    </div>
                    <div className="nx-progress">
                      <div className="nx-progress-bar">
                        <span style={{ width: `${t.progress}%` }} />
                      </div>
                      <em>{statusLabel(t.status, t.progress)}</em>
                    </div>
                    {t.dueDate && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.45rem',
                          fontSize: '0.82rem',
                          color: 'var(--nx-muted)',
                        }}
                      >
                        Hạn: {formatDue(t.dueDate)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="nx-emp-side">
          <section className="nx-panel">
            <div className="nx-emp-leave-head">
              <h2 className="nx-panel-title">Đơn nghỉ phép</h2>
              <Link to="/leave?create=1" className="nx-emp-leave-new">
                + Tạo đơn
              </Link>
            </div>
            <div className="nx-emp-leave-list">
              {pendingLeaves.length === 0 && (
                <div className="nx-empty">Không có đơn đang chờ duyệt.</div>
              )}
              {pendingLeaves.map((row) => (
                <Link
                  key={row.id}
                  to={`/leave/${row.id}`}
                  className="nx-emp-leave-item"
                >
                  <div className="nx-emp-leave-item-top">
                    <strong>{row.leaveTypeLabel}</strong>
                    <span className="nx-emp-leave-pending">Chờ duyệt</span>
                  </div>
                  <span>
                    {formatDateRange(row.startDate, row.endDate)}
                    {row.daysCount != null ? ` · ${row.daysCount} ngày` : ''}
                  </span>
                  {row.reason && (
                    <span style={{ marginTop: '0.25rem' }}>
                      {row.reason.length > 72
                        ? `${row.reason.slice(0, 72)}…`
                        : row.reason}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {(stats.annualQuota != null || stats.annualUsed != null) && (
              <div className="nx-emp-leave-quota">
                Phép năm:{' '}
                <strong>
                  {stats.annualUsed ?? 0}/{stats.annualQuota ?? '—'}
                </strong>{' '}
                đã dùng · còn <strong>{stats.leaveRemaining}</strong> ngày
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ManagerDashboard({
  stats,
  error,
  busyId,
  now,
  onReviewLeave,
}: {
  stats: ManagerStats;
  error: string;
  busyId: number | null;
  now: Date;
  onReviewLeave: (id: number, decision: 'APPROVED' | 'REJECTED') => void;
}) {
  const [tab, setTab] = useState<'doing' | 'review'>('doing');
  const rows =
    tab === 'doing' ? stats.inProgressTasks : stats.reviewTasks;
  const att = stats.attendance;

  return (
    <div className="nx-mgr">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="nx-mgr-head">
        <div>
          <div className="nx-dash-kicker">{formatViDate(now)}</div>
          <h1>
            {greetingForHour(now.getHours())}, Quản lý {stats.managerName}!
          </h1>
          <p className="nx-mgr-scope">
            <span className="nx-mgr-dept">{stats.departmentName}</span>
            <span className="nx-mgr-dot" />
            <span>
              <strong>{stats.employees}</strong> nhân sự trực thuộc
            </span>
            {stats.headcountTarget != null && (
              <>
                <span className="nx-mgr-dot" />
                <span>
                  Hạn ngạch định biên:{' '}
                  <strong>
                    {stats.employees}/{stats.headcountTarget} vị trí
                  </strong>
                </span>
              </>
            )}
          </p>
        </div>
        <div className="nx-mgr-actions">
          <Link to="/tasks/new" className="nx-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Giao việc mới
          </Link>
          <Link to="/leave" className="nx-btn-outline nx-mgr-quick">
            Duyệt nhanh
            {stats.pendingLeave > 0 ? (
              <em>({stats.pendingLeave} đơn)</em>
            ) : null}
          </Link>
        </div>
      </div>

      <div className="nx-kpi-grid">
        <div className="nx-kpi">
          <div className="nx-kpi-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3" />
              <circle cx="16.5" cy="9" r="2.5" />
              <path d="M3.5 19c1.5-2.8 3.6-4.2 5.5-4.2s4 1.4 5.5 4.2M13.5 15.2c1.3-.7 2.8-1 4.3-.7 1.4.3 2.6 1.1 3.7 2.5" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Nhân sự trực thuộc</div>
            <div className="nx-kpi-value">{stats.employees}</div>
            <div className="nx-kpi-hint">nhân viên trong phạm vi</div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="m8 12 2.5 2.5L16 9" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Công việc đang xử lý</div>
            <div className="nx-kpi-value">{stats.openTasks}</div>
            <div className="nx-kpi-hint">
              {stats.dueSoon > 0
                ? `${stats.dueSoon} sắp đến hạn`
                : 'nhiệm vụ đang mở'}
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4.5l3 1.5" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Chấm công hôm nay</div>
            <div className="nx-kpi-value">
              {att.checkedIn}
              <span className="nx-kpi-sub"> / {stats.employees}</span>
            </div>
            <div className="nx-kpi-hint up">
              {att.onTime} đúng giờ · {att.late} muộn
            </div>
          </div>
        </div>
        <div className="nx-kpi">
          <div className="nx-kpi-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </div>
          <div>
            <div className="nx-kpi-label">Nghỉ phép chờ duyệt</div>
            <div className="nx-kpi-value">
              {String(stats.pendingLeave).padStart(2, '0')}
            </div>
            <div className="nx-kpi-hint">yêu cầu mới</div>
          </div>
        </div>
      </div>

      <div className="nx-mgr-body">
        <section className="nx-panel nx-mgr-tasks">
          <div className="nx-mgr-panel-head">
            <h2 className="nx-panel-title" style={{ margin: 0 }}>
              Bảng công việc gần đây
            </h2>
            <div className="nx-mgr-tabs">
              <button
                type="button"
                className={tab === 'doing' ? 'on' : ''}
                onClick={() => setTab('doing')}
              >
                Đang làm ({stats.inProgressCount})
              </button>
              <button
                type="button"
                className={tab === 'review' ? 'on' : ''}
                onClick={() => setTab('review')}
              >
                Cần duyệt ({stats.needReviewCount})
              </button>
              <Link to="/tasks" className="nx-mgr-kanban">
                Kanban →
              </Link>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="nx-empty">Chưa có công việc trong mục này.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="nx-tasks-table">
                <thead>
                  <tr>
                    <th>Hạng mục công việc</th>
                    <th>Phụ trách</th>
                    <th>Hạn chót</th>
                    <th>Trạng thái</th>
                    <th>Mức độ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                      </td>
                      <td>
                        <div className="nx-mgr-assignee">
                          <span className="nx-leave-avatar sm">
                            {initials(t.assigneeName)}
                          </span>
                          <span>
                            <b>{t.assigneeName}</b>
                            {t.assigneePosition && (
                              <small>{t.assigneePosition}</small>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>{formatDue(t.dueDate)}</td>
                      <td>
                        {t.status === 'IN_PROGRESS' || t.status === 'TODO' ? (
                          <div className="nx-progress">
                            <div className="nx-progress-bar">
                              <span style={{ width: `${t.progress}%` }} />
                            </div>
                            <em>{statusLabel(t.status, t.progress)}</em>
                          </div>
                        ) : (
                          <span className="nx-status-pill">
                            {statusLabel(t.status, t.progress)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`nx-prio ${priorityClass(t.priority)}`}>
                          {priorityLabel(t.priority)}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/tasks/${t.id}`}
                          className="nx-icon-act"
                          title="Chi tiết"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="nx-mgr-foot">
            <span>
              Hiển thị {rows.length} trên tổng số {stats.openTasks} nhiệm vụ phân
              công
            </span>
            <Link to="/tasks">Xem toàn bộ bảng Kanban</Link>
          </div>
        </section>

        <aside className="nx-mgr-side">
          <section className="nx-panel">
            <div className="nx-mgr-panel-head">
              <h2 className="nx-panel-title" style={{ margin: 0 }}>
                Đơn nghỉ phép chờ duyệt
              </h2>
              {stats.pendingLeave > 0 && (
                <span className="nx-mgr-badge">{stats.pendingLeave}</span>
              )}
            </div>
            <div className="nx-mgr-leave-list">
              {stats.pendingLeaveRequests.length === 0 && (
                <div className="nx-empty">Không có đơn chờ duyệt.</div>
              )}
              {stats.pendingLeaveRequests.map((row) => (
                <div className="nx-mgr-leave-card" key={row.id}>
                  <div className="nx-mgr-leave-top">
                    <div className="nx-leave-avatar">
                      {initials(row.employeeName)}
                    </div>
                    <div className="nx-leave-meta">
                      <strong>{row.employeeName}</strong>
                      <span>
                        {row.employeePosition || 'Nhân viên'} ·{' '}
                        {formatDateRange(row.startDate, row.endDate)}
                      </span>
                    </div>
                    <span className="nx-leave-type">{row.leaveTypeLabel}</span>
                  </div>
                  {row.reason && (
                    <p className="nx-mgr-leave-reason">
                      {row.reason.length > 90
                        ? `${row.reason.slice(0, 90)}…`
                        : row.reason}
                    </p>
                  )}
                  <div className="nx-mgr-leave-btns">
                    <button
                      type="button"
                      className="nx-btn-approve"
                      disabled={busyId === row.id}
                      onClick={() => void onReviewLeave(row.id, 'APPROVED')}
                    >
                      Chấp thuận
                    </button>
                    <button
                      type="button"
                      className="nx-btn-reject"
                      disabled={busyId === row.id}
                      onClick={() => void onReviewLeave(row.id, 'REJECTED')}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="nx-panel">
            <h2 className="nx-panel-title">Việc quản lý cần thực hiện</h2>
            {stats.actionItems.length === 0 ? (
              <div className="nx-empty">Không có việc cần xử lý.</div>
            ) : (
              <ul className="nx-mgr-todo">
                {stats.actionItems.map((item) => (
                  <li key={item.id}>
                    <span className="nx-mgr-check" aria-hidden />
                    <div>
                      <Link to={item.href}>{item.label}</Link>
                      {item.dueHint && <small>{item.dueHint}</small>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SimpleDashboard({
  stats,
  username,
}: {
  stats: Record<string, unknown>;
  username?: string;
}) {
  const entries = Object.entries(stats).filter(
    ([k, v]) =>
      k !== 'role' &&
      k !== 'tasksByStatus' &&
      (typeof v === 'number' || typeof v === 'string'),
  );
  const taskEntries = Object.entries(
    (stats.tasksByStatus as Record<string, number>) || {},
  );

  return (
    <div>
      <div className="nx-dash-head">
        <div>
          <h1>Xin chào, {username}</h1>
          <p>Tổng quan theo vai trò {String(stats.role)}</p>
        </div>
      </div>
      <div className="nx-simple-stats">
        {entries.map(([k, v]) => (
          <div className="nx-kpi" key={k}>
            <div>
              <div className="nx-kpi-label">{k}</div>
              <div className="nx-kpi-value">{String(v)}</div>
            </div>
          </div>
        ))}
        {typeof stats.attendanceToday === 'object' &&
          stats.attendanceToday && (
            <div className="nx-kpi">
              <div>
                <div className="nx-kpi-label">Chấm công hôm nay</div>
                <div className="nx-kpi-value" style={{ fontSize: '1.1rem' }}>
                  {String(
                    (stats.attendanceToday as { status?: string }).status ||
                      '—',
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
      {taskEntries.length > 0 && (
        <section className="nx-panel" style={{ marginTop: '1rem' }}>
          <h2 className="nx-panel-title">Công việc theo trạng thái</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {taskEntries.map(([k, v]) => (
              <span key={k} className="nx-prio medium">
                {k}: {v}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
