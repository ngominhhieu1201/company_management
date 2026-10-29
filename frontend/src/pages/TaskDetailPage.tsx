import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/tasks.css';

type Emp = {
  id: number;
  fullName: string;
  employeeCode: string;
  position?: string | null;
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
  estimatedHours: number | null;
  actualHours: number | null;
  assignee: Emp | null;
  reviewer: Emp | null;
  collaborators: Emp[];
  reporter: Emp | null;
  reporterUsername: string | null;
  department: { id: number; name: string; departmentCode: string } | null;
  criteria: Criterion[];
  criteriaDone: number;
  criteriaTotal: number;
  sla: string;
};

type Comment = {
  id: number;
  body: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
};

type Audit = {
  id: number;
  action: string;
  createdAt: string;
  actorUsername: string;
};

const FLOW = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
const ST: Record<string, string> = {
  TODO: 'TODO',
  IN_PROGRESS: 'ĐANG THỰC HIỆN',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
};
const PRI: Record<string, string> = {
  URGENT: 'KHẨN CẤP',
  HIGH: 'CAO',
  MEDIUM: 'TRUNG BÌNH',
  LOW: 'THẤP',
};

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime()) && String(iso).includes('T')) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const [y, m, day] = String(iso).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function daysLeft(due: string | null) {
  if (!due) return null;
  const a = new Date(due + 'T00:00:00');
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.ceil((a.getTime() - b.getTime()) / 86400000);
}

function actionLabel(a: string) {
  const map: Record<string, string> = {
    TASK_CREATE: 'Tạo công việc',
    TASK_UPDATE: 'Cập nhật',
    TASK_STATUS_CHANGE: 'Đổi trạng thái',
    TASK_COMMENT: 'Bình luận',
  };
  return map[a] || a;
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHours, setEditHours] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, c, a] = await Promise.all([
        api.get<Detail>(`/tasks/${id}`),
        api.get<Comment[]>(`/tasks/${id}/comments`),
        api.get<Audit[]>(`/tasks/${id}/audit`, { params: { limit: 30 } }),
      ]);
      setDetail(d.data);
      setEditTitle(d.data.title);
      setEditDesc(d.data.description || '');
      setEditHours(
        d.data.actualHours != null ? String(d.data.actualHours) : '',
      );
      setComments(c.data);
      setAudit(a.data);
      setError('');
    } catch {
      setError('Không tải được chi tiết công việc');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: string) {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/tasks/${detail.id}`, { status });
      setOk(`Đã chuyển sang ${status}`);
      await load();
    } catch {
      setError('Đổi trạng thái thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCriterion(c: Criterion) {
    if (!detail || !canManage) return;
    const next = detail.criteria.map((x) =>
      x.id === c.id ? { ...x, done: !x.done } : x,
    );
    try {
      await api.patch(`/tasks/${detail.id}`, { criteria: next });
      await load();
    } catch {
      setError('Cập nhật tiêu chí thất bại');
    }
  }

  async function saveUpdates() {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/tasks/${detail.id}`, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        actualHours: editHours !== '' ? Number(editHours) : null,
      });
      setOk('Đã lưu cập nhật');
      await load();
    } catch {
      setError('Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    if (!detail || !comment.trim()) return;
    try {
      await api.post(`/tasks/${detail.id}/comments`, { body: comment.trim() });
      setComment('');
      const { data } = await api.get<Comment[]>(`/tasks/${detail.id}/comments`);
      setComments(data);
      const a = await api.get<Audit[]>(`/tasks/${detail.id}/audit`, {
        params: { limit: 30 },
      });
      setAudit(a.data);
    } catch {
      setError('Gửi bình luận thất bại');
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

  const left = daysLeft(detail.dueDate);
  const flowIdx = FLOW.indexOf(detail.status as (typeof FLOW)[number]);

  return (
    <div className="nx-td">
      <div className="nx-td-top">
        <div className="nx-tk-crumb">
          <Link to="/tasks">Bảng Kanban / Danh sách</Link>
          <span>›</span>
          <span>Quản lý công việc</span>
          <span>›</span>
          <span>Chi tiết: {detail.taskCode}</span>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1565c0' }}>
          {detail.taskCode}
        </div>
        <div className="nx-td-badges">
          <span className={`nx-tk-st ${detail.status === 'IN_PROGRESS' ? 'progress' : detail.status === 'REVIEW' ? 'review' : detail.status === 'DONE' ? 'done' : 'todo'}`}>
            {ST[detail.status] || detail.status}
          </span>
          <span
            className={`nx-tk-pri ${
              detail.priority === 'URGENT'
                ? 'urgent'
                : detail.priority === 'HIGH'
                  ? 'high'
                  : detail.priority === 'LOW'
                    ? 'low'
                    : 'medium'
            }`}
          >
            {PRI[detail.priority] || detail.priority}
          </span>
        </div>
        <h1>{detail.title}</h1>
        <div className="nx-td-actions">
          {detail.status === 'IN_PROGRESS' && (
            <button
              type="button"
              className="nx-btn-outline"
              disabled={saving}
              onClick={() => void setStatus('REVIEW')}
            >
              Wait Review
            </button>
          )}
          {detail.status !== 'DONE' && (
            <button
              type="button"
              className="nx-btn-primary"
              disabled={saving}
              onClick={() => void setStatus('DONE')}
            >
              Complete (DONE)
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {ok && (
        <Alert variant="success" dismissible onClose={() => setOk('')}>
          {ok}
        </Alert>
      )}

      <div className="nx-td-layout">
        <div>
          <section className="nx-td-card">
            <div className="nx-td-prog">
              <div className="big">{detail.progress}%</div>
              <div className="bar">
                <i style={{ width: `${Math.min(100, detail.progress)}%` }} />
              </div>
            </div>
            <div className="nx-td-metrics">
              <div className="nx-td-metric">
                <span>Thời gian thực tế</span>
                <strong>
                  {detail.actualHours ?? 0}h / {detail.estimatedHours ?? '—'}h
                </strong>
              </div>
              <div className="nx-td-metric">
                <span>Countdown SLA</span>
                <strong style={{ color: left != null && left < 0 ? '#c62828' : undefined }}>
                  {left == null
                    ? '—'
                    : left < 0
                      ? `Quá ${Math.abs(left)} ngày`
                      : left === 0
                        ? 'Hết hạn hôm nay'
                        : `${left} ngày`}
                </strong>
              </div>
              <div className="nx-td-metric">
                <span>Tiêu chí nghiệm thu</span>
                <strong>
                  {detail.criteriaDone}/{detail.criteriaTotal || 0} đạt
                </strong>
              </div>
            </div>
          </section>

          <section className="nx-td-card">
            <h2>Mô tả</h2>
            {canManage ? (
              <>
                <div className="nx-tc-field">
                  <label>Tiêu đề</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="nx-tc-field">
                  <label>Nội dung</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>
                <div className="nx-tc-field">
                  <label>Giờ thực tế</label>
                  <input
                    type="number"
                    min={0}
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {detail.description || '—'}
              </p>
            )}
            {detail.projectName && (
              <div className="nx-tc-hint" style={{ marginTop: 8 }}>
                Dự án: {detail.projectName}
              </div>
            )}
          </section>

          <section className="nx-td-card">
            <h2>
              Danh sách hạng mục công việc ({detail.criteriaDone}/
              {detail.criteriaTotal})
            </h2>
            {detail.criteria.length === 0 ? (
              <div className="nx-tc-hint">Chưa có tiêu chí</div>
            ) : (
              <ul className="nx-td-check">
                {detail.criteria.map((c) => (
                  <li key={c.id}>
                    <input
                      type="checkbox"
                      checked={c.done}
                      disabled={!canManage}
                      onChange={() => void toggleCriterion(c)}
                    />
                    <div>
                      <strong>{c.title}</strong>
                      <div className="nx-tc-hint">
                        {c.category || 'General'} ·{' '}
                        {c.done ? 'Đã đạt' : 'Đang thực hiện'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="nx-td-card">
            <h2>Trao đổi nội bộ</h2>
            <div className="nx-tc-field">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Viết bình luận…"
                rows={3}
              />
              <button
                type="button"
                className="nx-btn-outline"
                style={{ marginTop: 8 }}
                onClick={() => void postComment()}
              >
                Gửi
              </button>
            </div>
            <ul className="nx-td-comments">
              {comments.map((c) => (
                <li key={c.id}>
                  <div className="who">
                    {c.authorName} (@{c.authorUsername}) · {fmt(c.createdAt)}
                  </div>
                  <div>{c.body}</div>
                </li>
              ))}
              {comments.length === 0 && (
                <li style={{ color: '#7a8a85' }}>Chưa có trao đổi</li>
              )}
            </ul>
          </section>
        </div>

        <aside>
          <section className="nx-td-card">
            <h3>Luồng trạng thái</h3>
            <ul className="nx-td-flow">
              {FLOW.map((s, i) => (
                <li key={s} className={i <= flowIdx ? 'on' : ''}>
                  <i className="dot" />
                  {s}
                </li>
              ))}
            </ul>
            <div className="nx-td-actions" style={{ marginTop: 12 }}>
              {detail.status !== 'TODO' && detail.status !== 'DONE' && (
                <button
                  type="button"
                  className="nx-btn-outline"
                  onClick={() => void setStatus('TODO')}
                >
                  Hold → TODO
                </button>
              )}
            </div>
          </section>

          <section className="nx-td-card">
            <h3>Nhân sự thực thi</h3>
            <div className="nx-td-meta">
              <div>
                <span>Assignee</span>
                {detail.assignee?.fullName || '—'}
              </div>
              <div>
                <span>Reporter</span>
                {detail.reporter?.fullName ||
                  detail.reporterUsername ||
                  '—'}
              </div>
              <div>
                <span>Reviewer</span>
                {detail.reviewer?.fullName || '—'}
              </div>
              <div>
                <span>Phòng ban</span>
                {detail.department
                  ? `${detail.department.name} (${detail.department.departmentCode})`
                  : '—'}
              </div>
              {detail.collaborators?.length > 0 && (
                <div>
                  <span>Phối hợp</span>
                  {detail.collaborators.map((c) => c.fullName).join(', ')}
                </div>
              )}
            </div>
          </section>

          <section className="nx-td-card">
            <h3>Thời gian &amp; SLA</h3>
            <div className="nx-td-meta">
              <div>
                <span>Bắt đầu</span>
                {fmt(detail.startDate)}
              </div>
              <div>
                <span>Deadline</span>
                <strong
                  style={{
                    color:
                      detail.sla === 'overdue' || detail.sla === 'today'
                        ? '#c62828'
                        : undefined,
                  }}
                >
                  {fmt(detail.dueDate)}
                </strong>
              </div>
              <div>
                <span>Ưu tiên</span>
                {PRI[detail.priority]}
              </div>
              <div>
                <span>Ước tính / thực tế</span>
                {detail.estimatedHours ?? '—'}h / {detail.actualHours ?? 0}h
              </div>
            </div>
          </section>

          <section className="nx-td-card">
            <h3>Lịch sử thao tác</h3>
            <ul className="nx-td-audit">
              {audit.map((a) => (
                <li key={a.id}>
                  <strong>{actionLabel(a.action)}</strong>
                  <div className="meta">
                    {a.actorUsername} · {fmt(a.createdAt)}
                  </div>
                </li>
              ))}
              {audit.length === 0 && (
                <li style={{ color: '#7a8a85' }}>Chưa có nhật ký</li>
              )}
            </ul>
          </section>
        </aside>
      </div>

      <div className="nx-td-foot">
        <button type="button" className="ghost" onClick={() => navigate('/tasks')}>
          Quay lại
        </button>
        <div className="spacer" />
        {canManage && (
          <>
            <button
              type="button"
              className="nx-btn-outline"
              disabled={saving}
              onClick={() => void saveUpdates()}
            >
              Lưu cập nhật
            </button>
            {detail.status === 'IN_PROGRESS' && (
              <button
                type="button"
                className="nx-btn-primary"
                disabled={saving}
                onClick={() => void setStatus('REVIEW')}
              >
                Nghiệm thu &amp; chuyển REVIEW
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
