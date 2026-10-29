import { useEffect, useState } from 'react';
import { Alert, Table } from 'react-bootstrap';
import api from '../api/client';

type Log = {
  id: number;
  actorUserId: number | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: string | null;
  createdAt: string;
};

export default function LogsPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/system-logs')
      .then((r) => setRows(r.data))
      .catch(() => setError('Không tải nhật ký (chỉ Admin)'));
  }, []);

  return (
    <div>
      <h2 className="page-title mb-3">Nhật ký hệ thống</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <Table hover responsive className="bg-white shadow-sm">
        <thead>
          <tr>
            <th>Thời điểm</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Đối tượng</th>
            <th>Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.createdAt).toLocaleString()}</td>
              <td>{l.actorUserId ?? '—'}</td>
              <td>{l.action}</td>
              <td>
                {l.entityType}:{l.entityId}
              </td>
              <td>{l.result}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
