# NEXORA WorkSuite

Ứng dụng quản lý nội bộ doanh nghiệp (NestJS + React + SQLite).

## Chạy dự án

### Backend
```bash
cd backend
npm install
npm run start:dev
```
API: http://localhost:3000/api · Swagger: http://localhost:3000/api/docs

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

### Tài khoản demo

| Username | Password     | Role     |
|----------|--------------|----------|
| admin    | Admin@123    | ADMIN    |
| manager  | Manager@123  | MANAGER  |
| employee | Employee@123 | EMPLOYEE |

---

## Chức năng theo vai trò (để tự dùng / tự test)

### Chung (cả 3 role)
- Đăng nhập / đăng xuất (`/login`)
- Dashboard theo vai trò (`/dashboard`)
- Hồ sơ / tài khoản cá nhân (`/account`) — Employee: hồ sơ HR; Admin/Manager: đổi mật khẩu, phiên đăng nhập

### Admin
- Quản lý tài khoản: danh sách, tạo, chi tiết, khóa/mở khóa (`/users`, `/users/new`, `/users/:id`)
- Nhân sự toàn công ty: danh sách, tạo, chi tiết, sửa (`/employees`, `/employees/new`, `/employees/:id`)
- Phòng ban: danh sách, tạo, chi tiết (`/departments`, `/departments/new`, `/departments/:id`)
- Công việc toàn công ty: list/Kanban, tạo, chi tiết, sửa (`/tasks`, `/tasks/new`, `/tasks/:id`)
- Chấm công toàn công ty + chi tiết có ảnh (`/attendance`, `/attendance/:id`)
- Nghỉ phép: list, tạo hộ, chi tiết, **duyệt / từ chối** (`/leave`, `/leave/new`, `/leave/:id`)
- Nhật ký hệ thống (`/logs`)

### Manager
- Dashboard phạm vi phòng ban quản lý
- Nhân sự / phòng ban trong phạm vi QL (xem, sửa hồ sơ NV; không tạo tài khoản hệ thống)
- Công việc: tạo & giao việc, theo dõi, chi tiết, comment
- Chấm công nhân viên trong phạm vi
- Nghỉ phép: xem đơn cấp dưới, **duyệt / từ chối**
- Không vào `/users` (tạo user) và `/logs` (bị chặn)

### Employee
- **Tổng quan** cá nhân: ca hôm nay, việc ưu tiên, đơn phép gần đây (`/dashboard`)
- **Chấm công**: check-in / check-out kèm ảnh, ca làm việc (`/attendance`)
- **Lịch sử công**: danh sách bản ghi + chi tiết ảnh (`/attendance?view=history`, `/attendance/:id`)
- **Công việc của tôi**: Kanban cá nhân, KPI, tạo việc, chi tiết, cập nhật tiến độ, xin nghiệm thu (`/tasks`, `/tasks/new`, `/tasks/:id`)
- **Nghỉ phép**: quỹ phép, tạo đơn, lịch sử, chi tiết, hủy đơn đang chờ (`/leave`, `/leave/new`, `/leave/:id`)
- **Hồ sơ cá nhân**: thông tin NV, hợp đồng, KPI phép/chấm công (`/account`)
- Không duyệt phép, không vào quản lý tài khoản / nhật ký hệ thống

---

## Gợi ý tự test nhanh

1. Login lần lượt `admin` → `manager` → `employee`, xem menu sidebar khác nhau.
2. Admin: tạo user / NV / phòng ban / task; xem `/logs`.
3. Manager: tạo task giao NV; mở `/leave` duyệt đơn PENDING.
4. Employee: check-in ảnh; tạo/cập nhật task trên Kanban; gửi đơn nghỉ rồi xem chi tiết / hủy nếu còn PENDING.
5. Thử vào URL bị chặn (vd. employee mở `/users`, `/logs`) → phải redirect về dashboard.
