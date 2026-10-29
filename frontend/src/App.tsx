import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import { AuthProvider } from './contexts/AuthContext';
import AttendanceDetailPage from './pages/AttendanceDetailPage';
import AttendancePage from './pages/AttendancePage';
import DashboardPage from './pages/DashboardPage';
import DepartmentCreatePage from './pages/DepartmentCreatePage';
import DepartmentDetailPage from './pages/DepartmentDetailPage';
import DepartmentsPage from './pages/DepartmentsPage';
import EmployeeCreatePage from './pages/EmployeeCreatePage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import EmployeeEditPage from './pages/EmployeeEditPage';
import EmployeesPage from './pages/EmployeesPage';
import LeaveCreatePage from './pages/LeaveCreatePage';
import LeaveDetailPage from './pages/LeaveDetailPage';
import LeavePage from './pages/LeavePage';
import LoginPage from './pages/LoginPage';
import LogsPage from './pages/LogsPage';
import TaskCreatePage from './pages/TaskCreatePage';
import TaskDetailPage from './pages/TaskDetailPage';
import TaskEditPage from './pages/TaskEditPage';
import TasksPage from './pages/TasksPage';
import AccountProfilePage from './pages/AccountProfilePage';
import UserCreatePage from './pages/UserCreatePage';
import UserDetailPage from './pages/UserDetailPage';
import UsersPage from './pages/UsersPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />

              <Route path="/account" element={<AccountProfilePage />} />

              <Route element={<RoleRoute roles={['ADMIN', 'MANAGER']} />}>
                <Route path="/users/:id" element={<UserDetailPage />} />
                <Route path="/users" element={<UsersPage />} />
              </Route>

              <Route element={<RoleRoute roles={['ADMIN']} />}>
                <Route path="/users/new" element={<UserCreatePage />} />
                <Route path="/logs" element={<LogsPage />} />
              </Route>

              <Route element={<RoleRoute roles={['ADMIN', 'MANAGER']} />}>
                <Route path="/employees/new" element={<EmployeeCreatePage />} />
                <Route path="/departments/new" element={<DepartmentCreatePage />} />
              </Route>

              <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
              <Route path="/employees/:id" element={<EmployeeDetailPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/departments/:id" element={<DepartmentDetailPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/tasks/new" element={<TaskCreatePage />} />
              <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/attendance/:id" element={<AttendanceDetailPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/leave/new" element={<LeaveCreatePage />} />
              <Route path="/leave/:id" element={<LeaveDetailPage />} />
              <Route path="/leave" element={<LeavePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
