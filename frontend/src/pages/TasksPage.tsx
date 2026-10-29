import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Modal,
  Table,
} from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type Task = {
  id: number;
  title: string;
  description: string | null;
  assigneeId: number | null;
  priority: string;
  status: string;
  dueDate: string | null;
};

export default function TasksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Task[]>([]);
  const [emps, setEmps] = useState<{ id: number; fullName: string }[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    priority: 'MEDIUM',
    dueDate: '',
  });

  async function load() {
    try {
      const [t, e] = await Promise.all([
        api.get('/tasks'),
        api.get('/employees').catch(() => ({ data: [] })),
      ]);
      setRows(t.data);
      setEmps(e.data);
    } catch {
      setError('Không tải được công việc');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        title: form.title,
        description: form.description || undefined,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      });
      setShow(false);
      await load();
    } catch {
      setError('Tạo công việc thất bại');
    }
  }

  async function updateStatus(id: number, status: string) {
    try {
      await api.patch(`/tasks/${id}`, { status });
      await load();
    } catch {
      setError('Cập nhật trạng thái thất bại');
    }
  }

  const canCreate = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <h2 className="page-title mb-0">Công việc</h2>
        {canCreate && (
          <Button className="btn-accent" onClick={() => setShow(true)}>
            Tạo công việc
          </Button>
        )}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Table hover responsive className="bg-white shadow-sm">
        <thead>
          <tr>
            <th>Tiêu đề</th>
            <th>Ưu tiên</th>
            <th>Assignee</th>
            <th>Hạn</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.title}</td>
              <td>{t.priority}</td>
              <td>{t.assigneeId ?? '—'}</td>
              <td>{t.dueDate ?? '—'}</td>
              <td>{t.status}</td>
              <td>
                <Form.Select
                  size="sm"
                  value={t.status}
                  onChange={(e) => updateStatus(t.id, e.target.value)}
                >
                  {['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Form.Select>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={onCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Tạo công việc</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Tiêu đề</Form.Label>
              <Form.Control
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Người thực hiện</Form.Label>
              <Form.Select
                value={form.assigneeId}
                onChange={(e) =>
                  setForm({ ...form, assigneeId: e.target.value })
                }
              >
                <option value="">—</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Ưu tiên</Form.Label>
              <Form.Select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value })
                }
              >
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Hạn</Form.Label>
              <Form.Control
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button type="submit" className="btn-accent">
              Lưu
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
