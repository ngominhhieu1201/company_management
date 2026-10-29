import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Modal,
  Spinner,
  Table,
} from 'react-bootstrap';
import api from '../api/client';

type UserRow = {
  id: number;
  username: string;
  role: string;
  status: string;
  employeeId: number | null;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'EMPLOYEE',
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setRows(data);
    } catch {
      setError('Không tải được danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/users', form);
      setShow(false);
      setForm({ username: '', password: '', role: 'EMPLOYEE' });
      await load();
    } catch {
      setError('Tạo tài khoản thất bại');
    }
  }

  async function toggleLock(u: UserRow) {
    try {
      await api.patch(`/users/${u.id}`, {
        status: u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE',
      });
      await load();
    } catch {
      setError('Cập nhật trạng thái thất bại');
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="page-title mb-0">Tài khoản</h2>
        <Button className="btn-accent" onClick={() => setShow(true)}>
          Tạo tài khoản
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : (
        <Table hover responsive className="bg-white shadow-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Employee ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td>{u.employeeId ?? '—'}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => toggleLock(u)}
                  >
                    {u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={onCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Tạo tài khoản</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Username</Form.Label>
              <Form.Control
                required
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Vai trò</Form.Label>
              <Form.Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="EMPLOYEE">EMPLOYEE</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShow(false)}>
              Hủy
            </Button>
            <Button type="submit" className="btn-accent">
              Lưu
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
