import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type Dept = {
  id: number;
  departmentCode: string;
  name: string;
  description: string | null;
  managerEmployeeId: number | null;
  status: string;
};

export default function DepartmentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Dept[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    departmentCode: '',
    name: '',
    description: '',
  });

  async function load() {
    try {
      const { data } = await api.get('/departments');
      setRows(data);
    } catch {
      setError('Không tải được phòng ban');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/departments', form);
      setShow(false);
      await load();
    } catch {
      setError('Tạo phòng ban thất bại');
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <h2 className="page-title mb-0">Phòng ban</h2>
        {user?.role === 'ADMIN' && (
          <Button className="btn-accent" onClick={() => setShow(true)}>
            Thêm phòng ban
          </Button>
        )}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Table hover responsive className="bg-white shadow-sm">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Tên</th>
            <th>Mô tả</th>
            <th>Manager Emp</th>
            <th>TT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{d.departmentCode}</td>
              <td>{d.name}</td>
              <td>{d.description}</td>
              <td>{d.managerEmployeeId ?? '—'}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={onCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Thêm phòng ban</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Mã</Form.Label>
              <Form.Control
                required
                value={form.departmentCode}
                onChange={(e) =>
                  setForm({ ...form, departmentCode: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Tên</Form.Label>
              <Form.Control
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
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
