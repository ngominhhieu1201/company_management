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
import { useAuth } from '../contexts/AuthContext';

type Emp = {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: number | null;
  position: string;
  status: string;
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Emp[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    employeeCode: '',
    fullName: '',
    email: '',
    phone: '',
    position: '',
  });

  async function load(search = q) {
    try {
      const { data } = await api.get('/employees', { params: { q: search || undefined } });
      setRows(data);
    } catch {
      setError('Không tải được nhân viên');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/employees', form);
      setShow(false);
      await load();
    } catch {
      setError('Tạo nhân viên thất bại');
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <h2 className="page-title mb-0">Nhân viên</h2>
        <div className="d-flex gap-2">
          <Form.Control
            placeholder="Tìm mã / tên"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <Button variant="outline-secondary" onClick={() => load(q)}>
            Tìm
          </Button>
          {user?.role === 'ADMIN' && (
            <Button className="btn-accent" onClick={() => setShow(true)}>
              Thêm
            </Button>
          )}
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!rows.length ? (
        <Spinner />
      ) : (
        <Table hover responsive className="bg-white shadow-sm">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Họ tên</th>
              <th>Email</th>
              <th>SĐT</th>
              <th>Chức vụ</th>
              <th>PB</th>
              <th>TT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.employeeCode}</td>
                <td>{e.fullName}</td>
                <td>{e.email}</td>
                <td>{e.phone}</td>
                <td>{e.position}</td>
                <td>{e.departmentId ?? '—'}</td>
                <td>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={onCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Thêm nhân viên</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {(
              [
                ['employeeCode', 'Mã NV'],
                ['fullName', 'Họ tên'],
                ['email', 'Email'],
                ['phone', 'SĐT'],
                ['position', 'Chức vụ'],
              ] as const
            ).map(([key, label]) => (
              <Form.Group className="mb-2" key={key}>
                <Form.Label>{label}</Form.Label>
                <Form.Control
                  required={key === 'employeeCode' || key === 'fullName'}
                  value={form[key]}
                  onChange={(e) =>
                    setForm({ ...form, [key]: e.target.value })
                  }
                />
              </Form.Group>
            ))}
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
