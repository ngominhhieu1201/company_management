import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Badge, Button, Container, Nav, Navbar } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';

const links: { to: string; label: string; roles?: string[] }[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/employees', label: 'Nhân viên', roles: ['ADMIN', 'MANAGER'] },
  { to: '/departments', label: 'Phòng ban', roles: ['ADMIN', 'MANAGER'] },
  { to: '/users', label: 'Tài khoản', roles: ['ADMIN'] },
  { to: '/tasks', label: 'Công việc' },
  { to: '/attendance', label: 'Chấm công' },
  { to: '/leave', label: 'Nghỉ phép' },
  { to: '/logs', label: 'Nhật ký', roles: ['ADMIN'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visible = links.filter(
    (l) => !l.roles || (user && l.roles.includes(user.role)),
  );

  return (
    <div className="app-shell">
      <Navbar bg="dark" variant="dark" expand="lg" className="px-3">
        <Navbar.Brand className="fw-semibold">Nexora WorkSuite</Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse className="justify-content-end gap-2">
          <span className="text-white-50 small me-2">{user?.username}</span>
          <Badge bg="info">{user?.role}</Badge>
          <Button
            size="sm"
            variant="outline-light"
            className="ms-2"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Đăng xuất
          </Button>
        </Navbar.Collapse>
      </Navbar>
      <div className="d-flex">
        <aside className="sidebar p-3">
          <Nav className="flex-column gap-1">
            {visible.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `nav-side-link ${isActive ? 'active' : ''}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </Nav>
        </aside>
        <main className="flex-grow-1 p-4">
          <Container fluid>
            <Outlet />
          </Container>
        </main>
      </div>
    </div>
  );
}
