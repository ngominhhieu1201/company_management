import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/tasks.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  departmentId?: number | null;
  status: string;
};

type Criterion = {
  id: string;
  title: string;
  category: string | null;
  done: boolean;
};

type Detail = {
  id: number;
  taskCode: string;
  title: string;
  description: string | null;
  projectName: string | null;
  status: string;
  priority: string;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  assignee: { id: number; fullName: string; employeeCode: string } | null;
  department: { id: number; name: string; departmentCode: string } | null;
  criteria: Criterion[];
};

const PRIORITIES = [
  { val: 'LOW', label: 'LOW', hint: 'SLA ~14 ngày làm việc' },
  { val: 'MEDIUM', label: 'MEDIUM', hint: 'SLA ~7 ngày làm việc' },
  { val: 'HIGH', label: 'HIGH', hint: 'SLA ~3 ngày làm việc' },
  { val: 'URGENT', label: 'URGENT', hint: 'SLA ~24 giờ' },
] as const;

const STATUSES = [
  { val: 'TODO', label: 'TODO', cls: 'todo' },
  { val: 'IN_PROGRESS', label: 'IN PROGRESS', cls: 'progress' },
  { val: 'REVIEW', label: 'REVIEW', cls: 'review' },
  { val: 'DONE', label: 'DONE', cls: 'done' },
] as const;

function workingDaysBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  let count = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function TaskEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectName, setProjectName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [status, setStatus] = useState('TODO');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [taskRes, empRes] = await Promise.all([
        api.get<Detail>(`/tasks/${id}`),
        api.get<Emp[]>('/employees/options'),
      ]);
      const d = taskRes.data;
      setDetail(d);
      setTitle(d.title);
      setDescription(d.description || '');
      setProjectName(d.projectName || '');
      setAssigneeId(d.assignee ? String(d.assignee.id) : '');
      setPriority(d.priority || 'MEDIUM');
      setStatus(d.status || 'TODO');
      setStartDate(d.startDate?.slice(0, 10) || '');
      setDueDate(d.dueDate?.slice(0, 10) || '');
      setCriteria(
        d.criteria?.length
          ? d.criteria.map((c) => ({
              ...c,
              category: c.category || 'Other',
            }))
          : [{ id: `c${Date.now()}`, title: '', category: 'Other', done: false }],
      );
      setEmps(empRes.data.filter((e) => e.status === 'ACTIVE'));
      setError('');

      const isAssignee =
        user?.employeeId != null && d.assignee?.id === user.employeeId;
      if (!canManage && !isAssignee) {
        navigate(`/tasks/${id}`, { replace: true });
      }
    } catch {
      setError('Không tải được công việc');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, user, canManage, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!assigneeId) {
      setOpenTasks(null);
      return;
    }
    void api
      .get<{ total: number }>('/tasks', {
        params: {
          assigneeId: Number(assigneeId),
          scope: 'incomplete',
          pageSize: 1,
          page: 1,
        },
      })
      .then((r) => setOpenTasks(r.data.total))
      .catch(() => setOpenTasks(null));
  }, [assigneeId]);

  const workDays = useMemo(
    () => workingDaysBetween(startDate, dueDate),
    [startDate, dueDate],
  );

  const progress = detail?.progress ?? 0;
  const employeeEdit = !canManage && detail != null;

  async function submit() {
    if (!detail) return;
    if (title.trim().length < 2) {
      setError('Tiêu đề là bắt buộc');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const critPayload = criteria
        .filter((c) => c.title.trim())
        .map((c) => ({
          id: c.id,
          title: c.title.trim(),
          category: c.category || undefined,
          done: c.done,
        }));

      const body = employeeEdit
        ? {
            description: description.trim() || null,
            status,
            criteria: critPayload,
          }
        : {
            title: title.trim(),
            description: description.trim() || null,
            projectName: projectName.trim() || null,
            assigneeId: assigneeId ? Number(assigneeId) : null,
            priority,
            status,
            startDate: startDate || null,
            dueDate: dueDate || null,
            criteria: critPayload,
          };

      await api.patch(`/tasks/${detail.id}`, body);
      navigate(`/tasks/${detail.id}`);
    } catch {
      setError('Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        <Alert variant="danger">{error || 'Không tìm thấy'}</Alert>
        <Link to="/tasks">← Quay lại</Link>
      </div>
    );
  }

  return (
    <div className="nx-tc">
      <div className="nx-tc-top">
        <div className="nx-tk-crumb">
          <Link to={`/tasks/${detail.id}`}>Quay lại chi tiết</Link>
          <span>›</span>
          <span>Phân hệ Công việc</span>
          <span>›</span>
          <span>Chỉnh sửa {detail.taskCode}</span>
        </div>
        <h1>Cập Nhật Công Việc</h1>
        <div className="nx-tc-hint" style={{ marginTop: 4 }}>
          {detail.taskCode}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="nx-tc-grid">
        <div>
          <section className="nx-tc-card">
            <h2>01 · Thông tin nhận diện</h2>
            <div className="nx-tc-field">
              <label>
                Tiêu đề công việc <span className="req">*</span>
              </label>
              <input
                value={title}
                maxLength={150}
                disabled={employeeEdit}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="nx-tc-count">{title.length}/150</div>
            </div>
            <div className="nx-tc-field">
              <label>Dự án / module</label>
              <input
                value={projectName}
                disabled={employeeEdit}
                onChange={(e) => setProjectName(e.target.value)}
                list="nx-te-projects"
              />
              <datalist id="nx-te-projects">
                <option value="Nexora Core" />
                <option value="Nexora HR" />
              </datalist>
            </div>
            <div className="nx-tc-field">
              <label>Mức độ ưu tiên</label>
              <div className="nx-tc-prio-cards">
                {PRIORITIES.map(({ val, label, hint }) => (
                  <button
                    key={val}
                    type="button"
                    disabled={employeeEdit}
                    className={`nx-tc-prio-card nx-tc-prio-${val.toLowerCase()}${priority === val ? ' active' : ''}`}
                    onClick={() => setPriority(val)}
                  >
                    <strong>{label}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="nx-tc-field">
              <label>Trạng thái</label>
              <div className="nx-tc-status-radios">
                {STATUSES.map(({ val, label, cls }) => (
                  <label
                    key={val}
                    className={`nx-tc-status-opt${status === val ? ' active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="status"
                      checked={status === val}
                      onChange={() => setStatus(val)}
                    />
                    <span className={`nx-tk-st ${cls}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>02 · Thời gian &amp; SLA</h2>
            <div className="nx-tc-date-row">
              <div className="nx-tc-field">
                <label>Ngày bắt đầu</label>
                <input
                  type="date"
                  value={startDate}
                  disabled={employeeEdit}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="nx-tc-field">
                <label>Hạn hoàn thành</label>
                <input
                  type="date"
                  value={dueDate}
                  min={startDate || undefined}
                  disabled={employeeEdit}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="nx-tc-hint nx-tc-workdays-hint">
              {workDays != null
                ? `Khoảng ${workDays} ngày làm việc (T2–T6).`
                : 'Chọn ngày để xem số ngày làm việc.'}
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>03 · Mô tả &amp; nghiệm thu</h2>
            <div className="nx-tc-field">
              <label>Mô tả chi tiết</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="nx-tc-field">
              <label>Tiêu chí nghiệm thu</label>
              <ul className="nx-tc-criteria">
                {criteria.map((c, idx) => (
                  <li key={c.id}>
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={(e) => {
                        const next = [...criteria];
                        next[idx] = { ...c, done: e.target.checked };
                        setCriteria(next);
                      }}
                    />
                    <input
                      type="text"
                      value={c.title}
                      placeholder="Tiêu chí…"
                      onChange={(e) => {
                        const next = [...criteria];
                        next[idx] = { ...c, title: e.target.value };
                        setCriteria(next);
                      }}
                    />
                    {!employeeEdit && (
                      <button
                        type="button"
                        className="nx-btn-outline nx-tc-crit-rm"
                        onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!employeeEdit && (
                <button
                  type="button"
                  className="nx-btn-outline"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    setCriteria([
                      ...criteria,
                      {
                        id: `c${Date.now()}`,
                        title: '',
                        category: 'Other',
                        done: false,
                      },
                    ])
                  }
                >
                  + Thêm tiêu chí
                </button>
              )}
            </div>
          </section>
        </div>

        <aside>
          <section className="nx-tc-card nx-tc-aside">
            <h2>Tiến độ &amp; phân công</h2>
            <div className="nx-tc-prog-ring">
              <svg viewBox="0 0 36 36" aria-hidden>
                <path
                  className="nx-tc-prog-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="nx-tc-prog-fill"
                  strokeDasharray={`${progress}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="nx-tc-prog-val">{progress}%</div>
            </div>

            {detail.department && (
              <div className="nx-tc-scope-badge" style={{ marginBottom: '0.85rem' }}>
                <strong>{detail.department.name}</strong>
                <span>{detail.department.departmentCode}</span>
              </div>
            )}

            <div className="nx-tc-field">
              <label>Người thực hiện</label>
              <select
                value={assigneeId}
                disabled={employeeEdit}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">—</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode})
                  </option>
                ))}
              </select>
              {openTasks != null && assigneeId && (
                <div className="nx-tc-capacity">
                  Đang chạy: <strong>{openTasks}</strong> task
                </div>
              )}
            </div>

            {isAdmin ? (
              <div className="nx-tc-delete-note">
                <button type="button" className="nx-btn-outline" disabled title="Chưa hỗ trợ API">
                  Xóa công việc
                </button>
                <span>Xóa chưa hỗ trợ API</span>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <div className="nx-tc-foot nx-tc-foot-sticky">
        <button type="button" className="ghost" onClick={() => navigate(`/tasks/${detail.id}`)}>
          Hủy
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? 'Đang lưu…' : 'Cập nhật'}
        </button>
      </div>
    </div>
  );
}
