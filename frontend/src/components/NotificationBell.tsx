import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type NotifItem = {
  id: string;
  title: string;
  body: string;
  href: string;
};

type DashPayload = {
  role?: string;
  pendingLeave?: number;
  leavePending?: number;
  dueSoon?: number;
  needReviewCount?: number;
  openTasks?: number;
  highPriorityTasks?: number;
  notCheckedIn?: number;
  attendance?: { notCheckedIn?: number };
  attendanceToday?: { checkedIn?: boolean };
  pendingLeaveRequests?: {
    id: number;
    employeeName?: string;
    leaveTypeLabel?: string;
  }[];
  leavePendingItems?: { id: number; leaveCode?: string; leaveTypeLabel?: string }[];
};

function buildItems(data: DashPayload | null, role?: string): NotifItem[] {
  if (!data) return [];
  const items: NotifItem[] = [];

  if (role === 'EMPLOYEE') {
    if (data.attendanceToday && !data.attendanceToday.checkedIn) {
      items.push({
        id: 'checkin',
        title: 'Chưa check-in hôm nay',
        body: 'Bạn chưa chấm công vào ca — vào Chấm công để check-in.',
        href: '/attendance',
      });
    }
    const leaveN = data.leavePending ?? 0;
    if (leaveN > 0) {
      const first = data.leavePendingItems?.[0];
      items.push({
        id: 'leave-pending',
        title: `${leaveN} đơn nghỉ đang chờ duyệt`,
        body: first
          ? `${first.leaveCode || `Đơn #${first.id}`} · ${first.leaveTypeLabel || 'Nghỉ phép'}`
          : 'Theo dõi trạng thái phê duyệt tại Đơn nghỉ phép.',
        href: '/leave',
      });
    }
    if ((data.dueSoon ?? 0) > 0) {
      items.push({
        id: 'due-soon',
        title: `${data.dueSoon} công việc sắp đến hạn`,
        body: 'Ưu tiên hoàn thành trong 3 ngày tới.',
        href: '/tasks',
      });
    }
    if ((data.highPriorityTasks ?? 0) > 0) {
      items.push({
        id: 'prio',
        title: `${data.highPriorityTasks} việc ưu tiên cao`,
        body: 'Có task HIGH/URGENT đang mở trên bảng của bạn.',
        href: '/tasks',
      });
    }
    return items;
  }

  const pendingLeave = data.pendingLeave ?? 0;
  if (pendingLeave > 0) {
    const first = data.pendingLeaveRequests?.[0];
    items.push({
      id: 'leave-review',
      title: `${pendingLeave} đơn nghỉ chờ duyệt`,
      body: first?.employeeName
        ? `${first.employeeName} · ${first.leaveTypeLabel || 'Nghỉ phép'}`
        : 'Cần xem xét và phê duyệt.',
      href: '/leave',
    });
  }

  if ((data.needReviewCount ?? 0) > 0) {
    items.push({
      id: 'task-review',
      title: `${data.needReviewCount} công việc chờ nghiệm thu`,
      body: 'Task ở trạng thái REVIEW cần xác nhận.',
      href: '/tasks',
    });
  }

  if ((data.dueSoon ?? 0) > 0) {
    items.push({
      id: 'due-soon',
      title: `${data.dueSoon} công việc sắp đến hạn`,
      body: 'Trong phạm vi quản lý · hạn trong 3 ngày.',
      href: '/tasks',
    });
  }

  const missing =
    data.notCheckedIn ?? data.attendance?.notCheckedIn ?? 0;
  if (missing > 0) {
    items.push({
      id: 'att-missing',
      title: `${missing} người chưa check-in`,
      body: 'Theo dõi chấm công đội / công ty hôm nay.',
      href: '/attendance',
    });
  }

  if (items.length === 0 && (data.openTasks ?? 0) > 0) {
    items.push({
      id: 'open-tasks',
      title: `${data.openTasks} công việc đang mở`,
      body: 'Không có cảnh báo gấp — theo dõi backlog.',
      href: '/tasks',
    });
  }

  return items;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<DashPayload>('/dashboard');
      setItems(buildItems(data, user?.role));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = items.length;

  return (
    <div className="nx-notif" ref={wrapRef}>
      <button
        type="button"
        className={`nx-icon-btn${open ? ' open' : ''}`}
        aria-label="Thông báo"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 16h12l-1.2-1.5a6.5 6.5 0 0 1-1.3-4V9a4.5 4.5 0 1 0-9 0v1.5a6.5 6.5 0 0 1-1.3 4L6 16Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 && <span className="dot" aria-hidden />}
      </button>

      {open && (
        <div className="nx-notif-panel" role="dialog" aria-label="Danh sách thông báo">
          <div className="nx-notif-head">
            <strong>Thông báo</strong>
            <span>{loading ? 'Đang tải…' : `${count} mục`}</span>
          </div>
          {items.length === 0 ? (
            <div className="nx-notif-empty">
              {loading ? 'Đang tải thông báo…' : 'Không có thông báo mới'}
            </div>
          ) : (
            <ul className="nx-notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <Link to={n.href} onClick={() => setOpen(false)}>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
