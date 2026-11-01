import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import '../styles/tasks.css';
import '../styles/tasks-employee-forms.css';

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

type TaskAttachment = {
  key: string;
  originalName: string;
  size: number;
  mime: string;
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
  assignee: Emp | null;
  reporter: Emp | null;
  reporterUsername: string | null;
  reviewer: Emp | null;
  collaborators: Emp[];
  department: { id: number; name: string; departmentCode: string } | null;
  criteria: Criterion[];
  criteriaDone: number;
  criteriaTotal: number;
  attachments?: TaskAttachment[];
  estimatedHours: number | null;
  actualHours: number | null;
  sla: string;
  updatedAt?: string;
};

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

type TimelineItem =
  | {
      kind: 'comment';
      id: string;
      at: string;
      who: string;
      body: string;
    }
  | {
      kind: 'audit';
      id: string;
      at: string;
      who: string;
      action: string;
    };

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

const EMP_PRI: Record<string, string> = {
  URGENT: 'KHẨN CẤP',
  HIGH: 'ƯU TIÊN CAO (P1)',
  MEDIUM: 'TRUNG BÌNH',
  LOW: 'THẤP',
};

const MD_CHECK = /^-\s+\[([ xX])\]\s+(.*)$/;

type MdCheckItem = { lineIndex: number; done: boolean; label: string };

function parseMdChecklist(desc: string | null): MdCheckItem[] {
  if (!desc) return [];
  return desc.split('\n').flatMap((line, lineIndex) => {
    const m = line.match(MD_CHECK);
    if (!m) return [];
    return [
      {
        lineIndex,
        done: m[1].toLowerCase() === 'x',
        label: m[2].trim(),
      },
    ];
  });
}

function toggleMdChecklistLine(desc: string, lineIndex: number): string {
  const lines = desc.split('\n');
  const line = lines[lineIndex];
  if (!line) return desc;
  lines[lineIndex] = line.replace(
    /-\s+\[([ xX])\]/,
    (_, mark) => `- [${mark.trim().toLowerCase() === 'x' ? ' ' : 'x'}]`,
  );
  return lines.join('\n');
}

function bodyWithoutChecklist(desc: string | null): string {
  if (!desc) return '';
  return desc
    .split('\n')
    .filter((line) => !MD_CHECK.test(line))
    .join('\n')
    .trim();
}

function statusCls(status: string) {
  if (status === 'IN_PROGRESS') return 'progress';
  if (status === 'REVIEW') return 'review';
  if (status === 'DONE') return 'done';
  return 'todo';
}

function priorityCls(priority: string) {
  if (priority === 'URGENT') return 'urgent';
  if (priority === 'HIGH') return 'high';
  if (priority === 'LOW') return 'low';
  return 'medium';
}

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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, day] = String(iso).slice(0, 10).split('-');
  if (!y) return '—';
  return `${day}/${m}/${y}`;
}

function daysLeft(due: string | null) {
  if (!due) return null;
  const a = new Date(due + 'T00:00:00');
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.ceil((a.getTime() - b.getTime()) / 86400000);
}

function slaLabel(sla: string) {
  const map: Record<string, string> = {
    ok: 'Trong hạn',
    week: 'Trong tuần',
    soon: 'Sắp đến hạn',
    today: 'Hết hạn hôm nay',
    overdue: 'Quá hạn',
  };
  return map[sla] || sla;
}

function actionLabel(a: string) {
  const map: Record<string, string> = {
    TASK_CREATE: 'Tạo công việc',
    TASK_UPDATE: 'Cập nhật công việc',
    TASK_STATUS_CHANGE: 'Đổi trạng thái',
    TASK_COMMENT: 'Bình luận hệ thống',
  };
  return map[a] || a;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function TaskDetailPage() {
  const { id } = useParams();
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
  const [progProgress, setProgProgress] = useState(0);
  const [progStatus, setProgStatus] = useState('TODO');
  const [resultNotes, setResultNotes] = useState('');
  const [prUrl, setPrUrl] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, c, a] = await Promise.all([
        api.get<Detail>(`/tasks/${id}`),
        api.get<Comment[]>(`/tasks/${id}/comments`),
        api.get<Audit[]>(`/tasks/${id}/audit`, { params: { limit: 50 } }),
      ]);
      setDetail(d.data);
      setProgProgress(d.data.progress);
      setProgStatus(d.data.status);
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

  const isAssignee =
    detail != null &&
    user?.employeeId != null &&
    detail.assignee?.id === user.employeeId;

  const isEmployee = user?.role === 'EMPLOYEE';
  const isEmployeeView = isEmployee && !canManage;

  const canToggleCriteria = canManage || isAssignee;
  const canMarkDone = canManage || isAssignee;

  const mdChecklist = useMemo(
    () =>
      detail && detail.criteria.length === 0
        ? parseMdChecklist(detail.description)
        : [],
    [detail],
  );

  async function saveEmployeeProgress(submitReview: boolean) {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      const status = submitReview ? 'REVIEW' : progStatus;
      await api.patch(`/tasks/${detail.id}`, {
        status,
        progress: progProgress,
      });
      const noteParts: string[] = [];
      if (resultNotes.trim()) noteParts.push(resultNotes.trim());
      if (prUrl.trim()) noteParts.push(`PR: ${prUrl.trim()}`);
      if (noteParts.length) {
        await api.post(`/tasks/${detail.id}/comments`, {
          body: noteParts.join('\n'),
        });
      }
      setOk(submitReview ? 'Đã gửi xin nghiệm thu' : 'Đã lưu cập nhật tiến độ');
      await load();
    } catch {
      setError(submitReview ? 'Gửi nghiệm thu thất bại' : 'Lưu tiến độ thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function toggleMdItem(item: MdCheckItem) {
    if (!detail?.description) return;
    const nextDesc = toggleMdChecklistLine(detail.description, item.lineIndex);
    try {
      await api.patch(`/tasks/${detail.id}`, { description: nextDesc });
      await load();
    } catch {
      setError('Cập nhật checklist thất bại');
    }
  }

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...comments.map((c) => ({
        kind: 'comment' as const,
        id: `c-${c.id}`,
        at: c.createdAt,
        who: `${c.authorName} (@${c.authorUsername})`,
        body: c.body,
      })),
      ...audit.map((a) => ({
        kind: 'audit' as const,
        id: `a-${a.id}`,
        at: a.createdAt,
        who: a.actorUsername,
        action: a.action,
      })),
    ];
    items.sort(
      (x, y) => new Date(y.at).getTime() - new Date(x.at).getTime(),
    );
    return items;
  }, [comments, audit]);

  async function setStatus(status: string) {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/tasks/${detail.id}`, { status });
      setOk('Đã cập nhật trạng thái');
      await load();
    } catch {
      setError('Đổi trạng thái thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCriterion(c: Criterion) {
    if (!detail || !canToggleCriteria) return;
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

  async function postComment() {
    if (!detail || !comment.trim()) return;
    setSaving(true);
    try {
      await api.post(`/tasks/${detail.id}/comments`, { body: comment.trim() });
      setComment('');
      const [c, a] = await Promise.all([
        api.get<Comment[]>(`/tasks/${detail.id}/comments`),
        api.get<Audit[]>(`/tasks/${detail.id}/audit`, { params: { limit: 50 } }),
      ]);
      setComments(c.data);
      setAudit(a.data);
    } catch {
      setError('Gửi bình luận thất bại');
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
        <Link to="/tasks">← Quay lại danh sách</Link>
      </div>
    );
  }

  const left = daysLeft(detail.dueDate);
  const critTotal = detail.criteriaTotal || detail.criteria.length;
  const critDone = detail.criteriaDone;
  const progPct = Math.min(100, Math.max(0, detail.progress));
  const ringOffset = 100 - progPct;

  if (isEmployeeView) {
    const descBody = bodyWithoutChecklist(detail.description);
    const mdDone = mdChecklist.filter((c) => c.done).length;
    const mdTotal = mdChecklist.length;
    const showChecklist = detail.criteria.length > 0 || mdTotal > 0;

    return (
      <div className="nx-emp-td">
        <nav className="nx-tk-crumb nx-emp-td-crumb">
          <Link to="/tasks">Quay lại danh sách công việc</Link>
          <span>›</span>
          <span>Quản trị cá nhân</span>
          <span>›</span>
          <span>Công việc của tôi</span>
          <span>›</span>
          <span>Chi tiết #{detail.taskCode}</span>
        </nav>

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

        <div className="nx-emp-td-badges">
          <span className="code">#{detail.taskCode}</span>
          <span className={`nx-tk-pri ${priorityCls(detail.priority)}`}>
            {EMP_PRI[detail.priority] || detail.priority}
          </span>
          <span className={`nx-tk-st ${statusCls(detail.status)}`}>
            {ST[detail.status] || detail.status} ({progPct}%)
          </span>
        </div>
        {detail.projectName && (
          <div className="nx-emp-td-module">Module: {detail.projectName}</div>
        )}
        <h1 className="nx-emp-td-title">{detail.title}</h1>

        <div className="nx-emp-td-grid">
          <div className="nx-emp-td-main">
            <section className="nx-emp-td-card">
              <h2>Thông tin chung &amp; yêu cầu kỹ thuật</h2>
              <div className="nx-emp-td-desc-box">
                {descBody || (
                  <span className="nx-td-muted">Chưa có mô tả chi tiết</span>
                )}
              </div>
              {showChecklist && (
                <div className="nx-emp-td-checklist">
                  <div className="head">
                    <strong>Checklist / Definition of Done</strong>
                    <span>
                      {detail.criteria.length > 0
                        ? `${critDone}/${critTotal}`
                        : `${mdDone}/${mdTotal}`}{' '}
                      hoàn thành
                    </span>
                  </div>
                  <ul>
                    {detail.criteria.length > 0
                      ? detail.criteria.map((c) => (
                          <li key={c.id} className={c.done ? 'done' : ''}>
                            <input
                              type="checkbox"
                              checked={c.done}
                              disabled={!canToggleCriteria}
                              onChange={() => void toggleCriterion(c)}
                            />
                            <span>{c.title}</span>
                          </li>
                        ))
                      : mdChecklist.map((c) => (
                          <li key={c.lineIndex} className={c.done ? 'done' : ''}>
                            <input
                              type="checkbox"
                              checked={c.done}
                              disabled={!isAssignee}
                              onChange={() => void toggleMdItem(c)}
                            />
                            <span>{c.label}</span>
                          </li>
                        ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="nx-emp-td-card">
              <h2>Cập nhật tiến độ &amp; báo cáo bàn giao</h2>
              <div className="nx-emp-td-prog-field">
                <label>Tiến độ thực tế ({progProgress}%)</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progProgress}
                  disabled={!isAssignee}
                  onChange={(e) => setProgProgress(Number(e.target.value))}
                />
              </div>
              <div className="nx-emp-td-field">
                <label>Chuyển trạng thái công việc</label>
                <select
                  value={progStatus}
                  disabled={!isAssignee}
                  onChange={(e) => setProgStatus(e.target.value)}
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="REVIEW">REVIEW</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
              <div className="nx-emp-td-field">
                <label>Nội dung báo cáo kết quả / giải trình tiến độ</label>
                <textarea
                  value={resultNotes}
                  disabled={!isAssignee}
                  onChange={(e) => setResultNotes(e.target.value)}
                  rows={4}
                  placeholder="Mô tả kết quả, rủi ro, việc còn lại…"
                />
              </div>
              <div className="nx-emp-td-field">
                <label>Link Pull Request / Git commit</label>
                <input
                  type="url"
                  value={prUrl}
                  disabled={!isAssignee}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/…"
                />
              </div>
              <div className="nx-emp-td-actions">
                <button
                  type="button"
                  className="nx-btn-outline"
                  disabled={saving || !isAssignee}
                  onClick={() => void saveEmployeeProgress(false)}
                >
                  Lưu cập nhật tiến độ
                </button>
                <button
                  type="button"
                  className="nx-btn-primary"
                  disabled={saving || !isAssignee}
                  onClick={() => void saveEmployeeProgress(true)}
                >
                  Gửi báo cáo &amp; xin nghiệm thu
                </button>
              </div>
            </section>

            <section className="nx-emp-td-card">
              <h2>Tệp đính kèm</h2>
              {(detail.attachments?.length ?? 0) === 0 ? (
                <p className="nx-td-muted">Chưa có tệp đính kèm</p>
              ) : (
                <ul className="nx-emp-tc-files">
                  {detail.attachments!.map((a) => (
                    <li key={a.key}>
                      <a
                        href={`${apiBase}/tasks/files/${encodeURIComponent(a.key)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="nx-emp-td-card">
              <h2>Lịch sử thảo luận &amp; hoạt động</h2>
              <div className="nx-td-compose">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Viết phản hồi hoặc tag @dong_nghiep…"
                  rows={2}
                />
                <button
                  type="button"
                  className="nx-btn-primary"
                  disabled={saving || !comment.trim()}
                  onClick={() => void postComment()}
                >
                  Gửi
                </button>
              </div>
              <ul className="nx-emp-td-thread">
                {timeline.map((item) => (
                  <li key={item.id}>
                    <div className="meta">
                      <strong>{item.who}</strong>
                      <span>{fmt(item.at)}</span>
                    </div>
                    <p>
                      {item.kind === 'comment'
                        ? item.body
                        : actionLabel(item.action)}
                    </p>
                  </li>
                ))}
                {timeline.length === 0 && (
                  <li className="nx-td-muted">Chưa có thảo luận</li>
                )}
              </ul>
            </section>
          </div>

          <aside className="nx-emp-td-aside">
            <section className="nx-emp-td-card">
              <h3>Thông tin quản lý</h3>
              <ul className="nx-emp-td-meta">
                <li>
                  <span>Người tạo task</span>
                  <strong>
                    {detail.reporter?.fullName ||
                      detail.reporterUsername ||
                      '—'}
                  </strong>
                </li>
                <li>
                  <span>Người thực hiện</span>
                  <strong>{detail.assignee?.fullName || '—'}</strong>
                </li>
                <li>
                  <span>Người nghiệm thu</span>
                  <strong>
                    {detail.reviewer?.fullName ||
                      detail.collaborators.map((c) => c.fullName).join(', ') ||
                      '—'}
                  </strong>
                </li>
                <li>
                  <span>Hạn hoàn thành</span>
                  <strong
                    className={
                      detail.sla === 'overdue' || detail.sla === 'today'
                        ? 'warn'
                        : undefined
                    }
                  >
                    {left === 0
                      ? `Hôm nay, ${fmtDate(detail.dueDate)}`
                      : left != null && left < 0
                        ? `Quá ${Math.abs(left)} ngày`
                        : fmtDate(detail.dueDate)}
                  </strong>
                </li>
                <li>
                  <span>Thời gian ghi nhận</span>
                  <strong>
                    {detail.actualHours ?? 0}h / {detail.estimatedHours ?? '—'}h
                    ước lượng
                  </strong>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-td nx-td-mgr">
      <div className="nx-td-headbar">
        <nav className="nx-tk-crumb">
          <span>Quản trị</span>
          <span>›</span>
          <Link to="/tasks">Phân hệ Công việc</Link>
          <span>›</span>
          <span>Chi tiết</span>
          <span>›</span>
          <span>{detail.taskCode}</span>
        </nav>
        <div className="nx-td-head-actions">
          <Link to="/tasks" className="nx-btn-outline">
            Quay lại danh sách
          </Link>
          {canManage && (
            <Link to={`/tasks/${detail.id}/edit`} className="nx-btn-outline">
              Chỉnh sửa
            </Link>
          )}
          {detail.status !== 'DONE' && canMarkDone && (
            <button
              type="button"
              className="nx-btn-primary"
              disabled={saving}
              onClick={() => void setStatus('DONE')}
            >
              Mark DONE
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

      <div className="nx-td-identity">
        <span className="nx-td-code">{detail.taskCode}</span>
        <div className="nx-td-badges">
          <span className={`nx-tk-st ${statusCls(detail.status)}`}>
            {ST[detail.status] || detail.status}
          </span>
          <span className={`nx-tk-pri ${priorityCls(detail.priority)}`}>
            {PRI[detail.priority] || detail.priority}
          </span>
        </div>
        {detail.projectName && (
          <div className="nx-tk-scope-tags">
            <span>{detail.projectName}</span>
          </div>
        )}
      </div>

      <h1 className="nx-td-title">{detail.title}</h1>

      <div className="nx-td-layout">
        <div className="nx-td-main">
          <section className="nx-td-card">
            <h2>Mô tả công việc</h2>
            <div className="nx-td-desc">
              {detail.description?.trim() ? (
                detail.description
              ) : (
                <span className="nx-td-muted">Chưa có mô tả</span>
              )}
            </div>
          </section>

          <section className="nx-td-card">
            <div className="nx-td-crit-head">
              <h2>Tiêu chí nghiệm thu</h2>
              <span className="nx-td-crit-count">
                {critDone}/{critTotal}
              </span>
            </div>
            {detail.criteria.length === 0 ? (
              <div className="nx-td-muted">Chưa có tiêu chí</div>
            ) : (
              <ul className="nx-td-check">
                {detail.criteria.map((c) => (
                  <li key={c.id}>
                    <input
                      type="checkbox"
                      checked={c.done}
                      disabled={!canToggleCriteria}
                      onChange={() => void toggleCriterion(c)}
                    />
                    <div>
                      <strong className={c.done ? 'done' : undefined}>
                        {c.title}
                      </strong>
                      {c.category && (
                        <div className="nx-tc-hint">{c.category}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="nx-td-card">
            <h2>Tệp đính kèm</h2>
            {(detail.attachments?.length ?? 0) === 0 ? (
              <div className="nx-td-empty">
                <p>Chưa có tệp đính kèm</p>
              </div>
            ) : (
              <ul className="nx-emp-tc-files">
                {detail.attachments!.map((a) => (
                  <li key={a.key}>
                    <a
                      href={`${apiBase}/tasks/files/${encodeURIComponent(a.key)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.originalName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="nx-td-card">
            <h2>Lịch sử &amp; trao đổi</h2>
            <div className="nx-td-compose">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Viết bình luận hoặc cập nhật tiến độ…"
                rows={3}
              />
              <button
                type="button"
                className="nx-btn-primary"
                disabled={saving || !comment.trim()}
                onClick={() => void postComment()}
              >
                Gửi
              </button>
            </div>
            <ul className="nx-td-timeline">
              {timeline.map((item) => (
                <li
                  key={item.id}
                  className={
                    item.kind === 'comment' ? 'is-comment' : 'is-audit'
                  }
                >
                  <div className="nx-td-tl-meta">
                    <span className="tag">
                      {item.kind === 'comment' ? 'Bình luận' : 'Hệ thống'}
                    </span>
                    <span>{fmt(item.at)}</span>
                  </div>
                  <div className="nx-td-tl-who">{item.who}</div>
                  <div className="nx-td-tl-body">
                    {item.kind === 'comment'
                      ? item.body
                      : actionLabel(item.action)}
                  </div>
                </li>
              ))}
              {timeline.length === 0 && (
                <li className="nx-td-muted">Chưa có lịch sử hoặc trao đổi</li>
              )}
            </ul>
          </section>
        </div>

        <aside className="nx-td-aside">
          <section className="nx-td-card">
            <h3>Nhân sự</h3>
            <ul className="nx-td-person">
              <li>
                <span>Phụ trách chính</span>
                <strong>
                  {detail.assignee ? (
                    <>
                      <i className="av">{initials(detail.assignee.fullName)}</i>
                      {detail.assignee.fullName}
                      <em>{detail.assignee.employeeCode}</em>
                    </>
                  ) : (
                    '—'
                  )}
                </strong>
              </li>
              <li>
                <span>Quản lý</span>
                <strong>
                  {detail.reporter?.fullName ||
                    detail.reporterUsername ||
                    '—'}
                </strong>
              </li>
              <li>
                <span>Phòng ban</span>
                <strong>
                  {detail.department
                    ? `${detail.department.name} (${detail.department.departmentCode})`
                    : '—'}
                </strong>
              </li>
            </ul>
          </section>

          <section className="nx-td-card nx-td-sla">
            <h3>SLA &amp; tiến độ</h3>
            <div
              className={`nx-td-sla-days ${
                detail.sla === 'overdue' || detail.sla === 'today'
                  ? 'warn'
                  : ''
              }`}
            >
              {left == null
                ? '—'
                : left < 0
                  ? `Quá ${Math.abs(left)} ngày`
                  : left === 0
                    ? 'Hết hạn hôm nay'
                    : `Còn ${left} ngày`}
            </div>
            <div className="nx-td-sla-label">{slaLabel(detail.sla)}</div>
            <div className="nx-tc-prog-ring nx-td-sla-ring">
              <svg viewBox="0 0 36 36" aria-hidden>
                <path
                  className="nx-tc-prog-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="nx-tc-prog-fill"
                  strokeDasharray={`${progPct} ${ringOffset}`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="nx-tc-prog-val">{progPct}%</div>
            </div>
            <div className="nx-td-meta nx-td-sla-dates">
              <div>
                <span>Bắt đầu</span>
                {fmtDate(detail.startDate)}
              </div>
              <div>
                <span>Hạn hoàn thành</span>
                <strong
                  className={
                    detail.sla === 'overdue' || detail.sla === 'today'
                      ? 'warn'
                      : undefined
                  }
                >
                  {fmtDate(detail.dueDate)}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
