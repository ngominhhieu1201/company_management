import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
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

type Dept = {
  id: number;
  name: string;
  departmentCode: string;
  status: string;
};

type Criterion = { id: string; title: string; category: string; done: boolean };

const DRAFT_KEY = 'nexora-task-create-draft';

const PRIORITIES = [
  { val: 'LOW', label: 'LOW', hint: 'SLA ~14 ngày làm việc' },
  { val: 'MEDIUM', label: 'MEDIUM', hint: 'SLA ~7 ngày làm việc' },
  { val: 'HIGH', label: 'HIGH', hint: 'SLA ~3 ngày làm việc' },
  { val: 'URGENT', label: 'URGENT', hint: 'SLA ~24 giờ' },
] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [taskCode, setTaskCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectName, setProjectName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: 'c1', title: '', category: 'Other', done: false },
  ]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && user.role === 'EMPLOYEE') {
      navigate('/tasks', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    void api.get('/tasks/next-code').then((r) => setTaskCode(r.data.taskCode)).catch(() => undefined);
    void api
      .get('/employees/options')
      .then((r) => setEmps((r.data as Emp[]).filter((e) => e.status === 'ACTIVE')))
      .catch(() => undefined);
    void api.get('/departments').then((r) => setDepts(r.data)).catch(() => undefined);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.description) setDescription(d.description);
        if (d.projectName) setProjectName(d.projectName);
        if (d.assigneeId) setAssigneeId(d.assigneeId);
        if (d.priority) setPriority(d.priority);
        if (d.startDate) setStartDate(d.startDate);
        else setStartDate(todayIso());
        if (d.dueDate) setDueDate(d.dueDate);
        if (d.criteria) setCriteria(d.criteria);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const payload = {
      title,
      description,
      projectName,
      assigneeId,
      priority,
      startDate,
      dueDate,
      criteria,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [title, description, projectName, assigneeId, priority, startDate, dueDate, criteria]);

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

  const assignee = emps.find((e) => String(e.id) === assigneeId);
  const departmentId = assignee?.departmentId ?? null;
  const dept = depts.find((d) => d.id === departmentId);
  const assigner = emps.find((e) => e.id === user?.employeeId);
  const workDays = useMemo(
    () => workingDaysBetween(startDate, dueDate),
    [startDate, dueDate],
  );

  async function submit() {
    if (title.trim().length < 2) {
      setError('Tiêu đề là bắt buộc');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/tasks', {
        title: title.trim(),
        description: description.trim() || undefined,
        projectName: projectName.trim() || undefined,
        departmentId: departmentId ?? undefined,
        assigneeId: assigneeId ? Number(assigneeId) : undefined,
        priority,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        criteria: criteria
          .filter((c) => c.title.trim())
          .map((c) => ({
            id: c.id,
            title: c.title.trim(),
            category: c.category || undefined,
            done: false,
          })),
      });
      localStorage.removeItem(DRAFT_KEY);
      navigate(`/tasks/${data.id}`);
    } catch {
      setError('Tạo công việc thất bại');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="nx-tc">
      <div className="nx-tc-top">
        <div className="nx-tk-crumb">
          <Link to="/tasks">Quay lại danh sách</Link>
          <span>›</span>
          <span>Phân hệ Công việc</span>
          <span>›</span>
          <span>Tạo &amp; giao công việc</span>
        </div>
        <h1>Tạo &amp; Giao Công Việc Mới</h1>
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
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mô tả ngắn gọn nhiệm vụ…"
              />
              <div className="nx-tc-count">{title.length}/150</div>
            </div>
            <div className="nx-tc-field">
              <label>Mã công việc (xem trước)</label>
              <input value={taskCode} readOnly className="nx-tc-code-locked" />
              <div className="nx-tc-hint">Mã chính thức được gán khi tạo thành công.</div>
            </div>
            <div className="nx-tc-field">
              <label>Dự án / module</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="VD: Nexora Core v2"
                list="nx-tc-projects"
              />
              <datalist id="nx-tc-projects">
                <option value="Nexora Core" />
                <option value="Nexora HR" />
                <option value="Nexora Ops" />
              </datalist>
            </div>
            <div className="nx-tc-field">
              <label>Mức độ ưu tiên</label>
              <div className="nx-tc-prio-cards">
                {PRIORITIES.map(({ val, label, hint }) => (
                  <button
                    key={val}
                    type="button"
                    className={`nx-tc-prio-card nx-tc-prio-${val.toLowerCase()}${priority === val ? ' active' : ''}`}
                    onClick={() => setPriority(val)}
                  >
                    <strong>{label}</strong>
                    <span>{hint}</span>
                  </button>
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
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="nx-tc-field">
                <label>Hạn hoàn thành</label>
                <input
                  type="date"
                  value={dueDate}
                  min={startDate || undefined}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="nx-tc-hint nx-tc-workdays-hint">
              {workDays != null
                ? `Khoảng ${workDays} ngày làm việc (T2–T6) trong giai đoạn đã chọn.`
                : 'Chọn ngày bắt đầu và hạn để xem số ngày làm việc.'}
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>03 · Mô tả &amp; nghiệm thu</h2>
            <div className="nx-tc-field">
              <label>Mô tả chi tiết</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Yêu cầu, phạm vi, ràng buộc kỹ thuật…"
              />
            </div>
            <div className="nx-tc-field">
              <label>
                Tiêu chí nghiệm thu ({criteria.filter((c) => c.title.trim()).length})
              </label>
              <ul className="nx-tc-criteria">
                {criteria.map((c, idx) => (
                  <li key={c.id}>
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
                    <button
                      type="button"
                      className="nx-btn-outline nx-tc-crit-rm"
                      onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                      aria-label="Xóa tiêu chí"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
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
            </div>
            <div className="nx-tc-field">
              <label>Tệp đính kèm (tùy chọn)</label>
              <div className="nx-tc-dropzone" role="presentation">
                <p>Kéo thả tệp vào đây hoặc bấm để chọn</p>
                <span>Chưa hỗ trợ tải lên — chỉ hiển thị giao diện</span>
              </div>
            </div>
          </section>
        </div>

        <aside>
          <section className="nx-tc-card nx-tc-aside">
            <h2>04 · Phân công &amp; phạm vi</h2>
            <div className="nx-tc-field">
              <label>Phạm vi / phòng ban</label>
              <div className="nx-tc-scope-badge">
                {dept ? (
                  <>
                    <strong>{dept.name}</strong>
                    <span>{dept.departmentCode}</span>
                  </>
                ) : assignee ? (
                  <span className="muted">Chưa gán phòng ban</span>
                ) : (
                  <span className="muted">Chọn người thực hiện để xem phạm vi</span>
                )}
              </div>
            </div>
            <div className="nx-tc-field">
              <label>Người giao việc</label>
              <input
                readOnly
                value={
                  assigner
                    ? `${assigner.fullName} (${assigner.employeeCode})`
                    : user?.username || '—'
                }
                className="nx-tc-code-locked"
              />
            </div>
            <div className="nx-tc-field">
              <label>Người thực hiện</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">— Chọn nhân sự —</option>
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
            <div className="nx-tc-field">
              <label>Trạng thái ban đầu</label>
              <div className="nx-tc-status-fixed">
                <span className="nx-tk-st todo">TODO</span>
                <span className="nx-tc-hint">Cố định khi tạo mới</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="nx-tc-foot nx-tc-foot-sticky">
        <button type="button" className="ghost" onClick={() => navigate('/tasks')}>
          Huỷ bỏ
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? 'Đang tạo…' : 'Tạo & Giao công việc'}
        </button>
      </div>
    </div>
  );
}
