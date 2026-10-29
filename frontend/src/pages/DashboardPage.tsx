import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Spinner } from 'react-bootstrap';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard')
      .then((r) => setStats(r.data))
      .catch(() => setError('Không tải được dashboard'));
  }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!stats) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  const taskEntries = Object.entries(
    (stats.tasksByStatus as Record<string, number>) || {},
  );

  return (
    <div>
      <h2 className="page-title mb-1">Dashboard</h2>
      <p className="text-muted mb-4">
        Xin chào {user?.username} — tổng quan theo vai trò {user?.role}
      </p>
      <Row className="g-3">
        {'employees' in stats && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Nhân viên</div>
                <div className="stat-value">{String(stats.employees)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
        {'departments' in stats && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Phòng ban</div>
                <div className="stat-value">{String(stats.departments)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
        {'pendingLeave' in stats && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Đơn nghỉ chờ duyệt</div>
                <div className="stat-value">{String(stats.pendingLeave)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
        {'leavePending' in stats && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Đơn nghỉ của tôi (chờ)</div>
                <div className="stat-value">{String(stats.leavePending)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
        {'dueSoon' in stats && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Công việc sắp hạn</div>
                <div className="stat-value">{String(stats.dueSoon)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
        {'attendanceToday' in stats &&
          typeof stats.attendanceToday === 'object' &&
          stats.attendanceToday && (
            <Col md={3}>
              <Card className="stat-card">
                <Card.Body>
                  <div className="stat-label">Chấm công hôm nay</div>
                  <div className="stat-value small">
                    {String(
                      (stats.attendanceToday as { status?: string }).status ||
                        (stats.attendanceToday as { checkedIn?: boolean })
                          .checkedIn === false
                        ? 'Chưa chấm'
                        : '—',
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          )}
        {typeof stats.attendanceToday === 'number' && (
          <Col md={3}>
            <Card className="stat-card">
              <Card.Body>
                <div className="stat-label">Lượt chấm công hôm nay</div>
                <div className="stat-value">{String(stats.attendanceToday)}</div>
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>
      {taskEntries.length > 0 && (
        <Card className="mt-4 border-0 shadow-sm">
          <Card.Body>
            <h5>Công việc theo trạng thái</h5>
            <div className="d-flex flex-wrap gap-3 mt-2">
              {taskEntries.map(([k, v]) => (
                <span key={k} className="badge-soft">
                  {k}: {v}
                </span>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
