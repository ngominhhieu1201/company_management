# NEXORA WorkSuite

Ứng dụng quản lý nội bộ doanh nghiệp (NestJS + React + SQLite).

## Chức năng

- **Đăng nhập / đăng xuất** theo 3 vai trò: Admin, Manager, Employee
- **Tài khoản & phân quyền** (Admin)
- **Nhân sự & phòng ban**
- **Công việc**: giao việc, Kanban, cập nhật tiến độ, nghiệm thu
- **Chấm công**: check-in/out kèm ảnh, lịch sử
- **Nghỉ phép**: tạo đơn, duyệt/từ chối, theo dõi
- **Dashboard** theo từng vai trò
- **Hồ sơ cá nhân** (Employee)
- **Nhật ký hệ thống** (Admin)

## Chạy dự án

### Backend
```bash
cd backend
npm install
npm run start:dev
```
API: http://localhost:3000/api

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

### Tài khoản demo

| Username | Password   | Role     |
|----------|------------|----------|
| admin    | Admin@123  | ADMIN    |
| manager  | Manager@123| MANAGER  |
| employee | Employee@123 | EMPLOYEE |
