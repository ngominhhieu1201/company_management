import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Spinner } from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type AttendanceBlock = {
  checkedIn: number;
  onTime: number;
  late: number;
  notCheckedIn: number;
  onTimePct: number;
  latePct: number;
  notCheckedInPct: number;
  avgCheckIn: string | null;
};

type LeaveItem = {
  id: number;
  employeeName: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
};

type TaskItem = {
  id: number;
  title: string;
  assigneeName: string;
  dueDate: string | null;
  priority: string;
  progress: number;
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

function priorityClass(p: string) {
  if (p === 'HIGH' || p === 'URGENT') return 'high';
  if (p === 'LOW') return 'low';
  return 'medium';
}

function priorityLabel(p: string) {
  if (p === 'HIGH' || p === 'URGENT') return 'Cao';
  if (p === 'LOW') return 'Thấp';
  return 'Trung bình';
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
