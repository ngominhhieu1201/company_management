import { useEffect, useState } from 'react';
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
  position?: string | null;
  status: string;
};
type Dept = {
  id: number;
  name: string;
  departmentCode: string;
  status: string;
  headcount?: number;
};

type Criterion = { id: string; title: string; category: string; done: boolean };

const DRAFT_KEY = 'nexora-task-create-draft';

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [taskCode, setTaskCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectName, setProjectName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [collaborators, setCollaborators] = useState<number[]>([]);
  const [addCollab, setAddCollab] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: 'c1', title: '', category: 'Backend', done: false },
  ]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
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
        if (d.departmentId) setDepartmentId(d.departmentId);
        if (d.assigneeId) setAssigneeId(d.assigneeId);
        if (d.reviewerId) setReviewerId(d.reviewerId);
        if (d.collaborators) setCollaborators(d.collaborators);
        if (d.priority) setPriority(d.priority);
        if (d.startDate) setStartDate(d.startDate);
        if (d.dueDate) setDueDate(d.dueDate);
        if (d.estimatedHours) setEstimatedHours(d.estimatedHours);
        if (d.criteria) setCriteria(d.criteria);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const assignee = emps.find((e) => String(e.id) === assigneeId);
  const dept = depts.find((d) => String(d.id) === departmentId);
  const manDays = Math.round(((Number(estimatedHours) || 0) / 8) * 10) / 10;

  function saveLocal() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        title,
        description,
        projectName,
        departmentId,
        assigneeId,
        reviewerId,
        collaborators,
        priority,
        startDate,
        dueDate,
        estimatedHours,
        criteria,
      }),
    );
  }

  async function reloadCode() {
    const { data } = await api.get('/tasks/next-code');
    setTaskCode(data.taskCode);
  }

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
        departmentId: departmentId ? Number(departmentId) : undefined,
        assigneeId: assigneeId ? Number(assigneeId) : undefined,
        reviewerEmployeeId: reviewerId ? Number(reviewerId) : undefined,
        collaboratorIds: collaborators.length ? collaborators : undefined,
        priority,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
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
          <span>Quản lý công việc</span>
          <span>›</span>
          <span>Tạo công việc mới</span>
        </div>
        <h1>Khởi Tạo &amp; Giao Việc Mới</h1>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="nx-tc-grid">
        <div>
          <section className="nx-tc-card">
            <h2>01 · Thông tin nhận diện &amp; phạm vi</h2>
            <div className="nx-tc-field">
              <label>Mã định danh công việc</label>
              <div className="nx-tc-code-row">
                <input value={taskCode} readOnly />
                <button type="button" className="nx-btn-outline" onClick={() => void reloadCode()}>
                  Tạo mã mới
                </button>
              </div>
              <div className="nx-tc-hint">Mã được hệ thống cấp khi lưu (xem trước).</div>
            </div>
            <div className="nx-tc-field">
              <label>
                Tiêu đề công việc <span className="req">*</span>
              </label>
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mô tả ngắn gọn nhiệm vụ…"
              />
              <div className="nx-tc-count">{title.length}/200</div>
            </div>
            <div className="nx-tc-field">
              <label>Khối phòng ban phụ trách</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">— Chọn phòng ban —</option>
                {depts
                  .filter((d) => d.status === 'ACTIVE')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.departmentCode})
                    </option>
                  ))}
              </select>
              {dept && (
                <div className="nx-tc-hint">
                  {dept.name} · {dept.departmentCode}
                  {dept.headcount != null ? ` · ${dept.headcount} NS` : ''}
                </div>
              )}
            </div>
            <div className="nx-tc-field">
              <label>Dự án / module</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="VD: Nexora Core v2"
              />
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>02 · Mô tả chi tiết nhiệm vụ</h2>
            <div className="nx-tc-field">
              <label>Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Yêu cầu kỹ thuật, phạm vi, ràng buộc…"
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
                    <select
                      value={c.category}
                      onChange={(e) => {
                        const next = [...criteria];
                        next[idx] = { ...c, category: e.target.value };
                        setCriteria(next);
                      }}
                    >
                      <option>Backend</option>
                      <option>Mobile UI</option>
                      <option>QA / QC</option>
                      <option>Docs</option>
                      <option>Other</option>
                    </select>
                    <button
                      type="button"
                      className="nx-btn-outline"
                      onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                    >
                      Xóa
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
                      category: 'Backend',
                      done: false,
                    },
                  ])
                }
              >
                + Thêm tiêu chí nghiệm thu
              </button>
            </div>
          </section>
        </div>

        <div>
          <section className="nx-tc-card">
            <h2>Người thực hiện &amp; giám sát</h2>
            <div className="nx-tc-field">
              <label>Người chịu trách nhiệm chính</label>
              <select
                value={assigneeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAssigneeId(id);
                  const emp = emps.find((x) => String(x.id) === id);
                  if (emp?.departmentId && !departmentId) {
                    setDepartmentId(String(emp.departmentId));
                  }
                }}
              >
                <option value="">—</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode})
                  </option>
                ))}
              </select>
              {assignee && (
                <div className="nx-tc-hint">
                  {assignee.employeeCode}
                  {assignee.position ? ` · ${assignee.position}` : ''}
                </div>
              )}
            </div>
            <div className="nx-tc-field">
              <label>Người phối hợp</label>
              <select
                value={addCollab}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !collaborators.includes(id)) {
                    setCollaborators([...collaborators, id]);
                  }
                  setAddCollab('');
                }}
              >
                <option value="">+ Thêm người</option>
                {emps
                  .filter(
                    (e) =>
                      !collaborators.includes(e.id) &&
                      String(e.id) !== assigneeId,
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
              </select>
              <div className="nx-tc-chips">
                {collaborators.map((id) => {
                  const e = emps.find((x) => x.id === id);
                  return (
                    <span key={id} className="nx-tc-chip">
                      {e?.fullName || id}
                      <button
                        type="button"
                        onClick={() =>
                          setCollaborators(collaborators.filter((x) => x !== id))
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="nx-tc-field">
              <label>Người duyệt nghiệm thu</label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
              >
                <option value="">—</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>Tiến độ &amp; kiểm soát SLA</h2>
            <div className="nx-tc-field">
              <label>Ngày bắt đầu</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="nx-tc-field">
              <label>Hạn chót (Deadline)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="nx-tc-field">
              <label>Ước tính giờ công</label>
              <input
                type="number"
                min={0}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
              <div className="nx-tc-hint">
                Tương đương ~{manDays} ngày công (8h/ngày)
              </div>
            </div>
          </section>

          <section className="nx-tc-card">
            <h2>Mức độ ưu tiên</h2>
            <div className="nx-tc-prios">
              {(
                [
                  ['LOW', 'LOW (Thấp)'],
                  ['MEDIUM', 'MEDIUM (Vừa)'],
                  ['HIGH', 'HIGH (Cao)'],
                  ['URGENT', 'URGENT (Khẩn)'],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className={`nx-tc-prio${priority === val ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="pri"
                    checked={priority === val}
                    onChange={() => setPriority(val)}
                    style={{ marginRight: 6 }}
                  />
                  <strong>{label}</strong>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="nx-tc-foot">
        <button type="button" className="ghost" onClick={() => navigate('/tasks')}>
          Hủy bỏ
        </button>
        <button
          type="button"
          className="nx-btn-outline"
          onClick={() => {
            saveLocal();
            setError('');
            alert('Đã lưu nháp trên trình duyệt');
          }}
        >
          Lưu nháp
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="nx-btn-primary"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? 'Đang tạo…' : 'Xác nhận tạo & Giao việc ngay'}
        </button>
      </div>
    </div>
  );
}
