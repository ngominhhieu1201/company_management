import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type Leave = {
  id: number;
  employeeId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
};

export default function LeavePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Leave[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    leaveType: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: '',
  });

  async function load() {
    try {
      const { data } = await api.get('/leave');
      setRows(data);
    } catch {
      setError('Không tải được đơn nghỉ');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/leave', form);
      setShow(false);
      await load();
    } catch {
      setError('Gửi đơn thất bại');
    }
  }

  async function review(id: number, decision: 'APPROVED' | 'REJECTED') {
    try {
      await api.patch(`/leave/${id}/review`, { decision });
      await load();
    } catch {
      setError('Phê duyệt thất bại');
    }
  }

  const canReview = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <h2 className="page-title mb-0">Nghỉ phép</h2>
        <Button className="btn-accent" onClick={() => setShow(true)}>
          Gửi đơn
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Table hover responsive className="bg-white shadow-sm">
        <thead>
          <tr>
            <th>NV</th>
            <th>Loại</th>
            <th>Từ</th>
            <th>Đến</th>
            <th>Lý do</th>
            <th>TT</th>
            {canReview && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employeeId}</td>
              <td>{r.leaveType}</td>
              <td>{r.startDate}</td>
              <td>{r.endDate}</td>
              <td>{r.reason}</td>
              <td>{r.status}</td>
              {canReview && (
                <td>
                  {r.status === 'PENDING' && (
                    <div className="d-flex gap-1">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => review(r.id, 'APPROVED')}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => review(r.id, 'REJECTED')}
                      >
                        Từ chối
                      </Button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={onCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Đơn nghỉ phép</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Loại</Form.Label>
              <Form.Select
                value={form.leaveType}
                onChange={(e) =>
                  setForm({ ...form, leaveType: e.target.value })
                }
              >
                {['ANNUAL', 'SICK', 'UNPAID', 'OTHER'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Từ ngày</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Đến ngày</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Lý do</Form.Label>
              <Form.Control
                as="textarea"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button type="submit" className="btn-accent">
              Gửi
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
