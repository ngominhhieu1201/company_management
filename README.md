# Hệ thống Quản lý Công ty (NEXORA)

Ứng dụng web quản lý nội bộ doanh nghiệp — môn **Web nâng cao** (Phenikaa).

**Stack:** NestJS + React (Vite) + react-bootstrap + TypeORM + SQLite.

---

## Đối chiếu nghiệp vụ (SRS 1.0 + FRS 1.0)

### Phân hệ đã triển khai

| Mã | Phân hệ | API | Giao diện (admin / theo role) | Ghi chú đối chiếu |
|----|---------|-----|-------------------------------|-------------------|
| MOD-01 | Tài khoản & phân quyền | `/api/auth`, `/api/users` | Login, Users list/create/detail | UC-01…03, UI-01…02 |
| MOD-02 | Nhân sự & phòng ban | `/api/employees`, `/api/departments` | Employees ×3, Departments ×3 | UC-04…05, UI-03…04 |
| MOD-03 | Công việc | `/api/tasks` | Tasks list/create/detail | UC-06…07, UI-05 |
| MOD-04 | Chấm công + ảnh | `/api/attendance` | Attendance list/detail (+ check-in/out camera) | UC-08…09, UI-06…07 — **theo SRS**: ảnh trực tiếp + thời gian máy chủ |
| MOD-05 | Nghỉ phép | `/api/leave` | Leave list/create/detail | UC-10…11, UI-09 |
| MOD-06 | Dashboard & nhật ký | `/api/dashboard`, `/api/system-logs` | Dashboard, Logs | UC-12…13, UI-10 |

### 19 màn admin (FE mẫu đã gửi)

| # | Màn | Route |
|---|-----|--------|
| 1 | Đăng nhập | `/login` |
| 2 | Dashboard | `/dashboard` |
| 3 | Danh sách tài khoản | `/users` |
| 4 | Tạo tài khoản | `/users/new` |
| 5 | Chi tiết tài khoản | `/users/:id` |
| 6 | Danh sách nhân sự | `/employees` |
| 7 | Tạo nhân viên | `/employees/new` |
| 8 | Chi tiết nhân viên | `/employees/:id` |
| 9 | Danh sách phòng ban | `/departments` |
| 10 | Tạo phòng ban | `/departments/new` |
| 11 | Chi tiết phòng ban | `/departments/:id` |
| 12 | Danh sách công việc | `/tasks` |
| 13 | Tạo công việc | `/tasks/new` |
| 14 | Chi tiết công việc | `/tasks/:id` |
| 15 | Lịch sử chấm công | `/attendance` |
| 16 | Chi tiết bản ghi chấm công | `/attendance/:id` |
| 17 | Danh sách nghỉ phép | `/leave` |
| 18 | Tạo đơn nghỉ phép | `/leave/new` |
| 19 | Chi tiết / phê duyệt nghỉ phép | `/leave/:id` |

*(Nhật ký hệ thống `/logs` — hỗ trợ UC-13, không tính trong 19 màn mock admin chính.)*

### Ma trận quyền (đã kiểm tại backend + UI)

| Chức năng | Admin | Manager | Employee |
|-----------|-------|---------|----------|
| Quản lý tài khoản / nhật ký | Có | Không (API 403 + UI ẩn/redirect) | Không |
| Nhân sự / phòng ban | Toàn công ty | Phạm vi QL: list + chi tiết + sửa hồ sơ (`/employees`, `/employees/:id`, `/employees/:id/edit`); không đổi phòng ban khi sửa | Xem/sửa hạn chế theo scope |
| Tạo / giao việc | Có | Phạm vi quản lý | Không (UI chặn `/tasks/new`) |
| Cập nhật công việc được giao | Có | Có | Có |
| Chấm công ảnh | Theo chính sách | Theo chính sách | Check-in/out + lịch sử bản thân |
| Tra cứu chấm công | Toàn công ty | Phạm vi QL | Bản thân |
| Gửi đơn nghỉ | Có (nếu gắn NV) | Có (nếu gắn NV) | Có |
| Phê duyệt nghỉ | Có | Có (phạm vi) | Không |
| Dashboard | Toàn công ty | Phạm vi QL | Cá nhân |

### Quy tắc nghiệp vụ cốt lõi đã cover

- **BR-ACC / BR-01…05:** JWT cookie, bcrypt, RolesGuard, LOCKED không login, không tự nâng quyền.
- **BR-HR:** Mã NV duy nhất; phòng ban INACTIVE không gán mới (service).
- **BR-TASK:** Task mới = `TODO`; employee chỉ sửa việc được giao.
- **BR-ATT (SRS):** 1 bản ghi/ngày (`UNIQUE employee+workDate`); ra sau vào; bắt buộc ảnh; thời gian server; ảnh private qua `/attendance/photo/:key`.
- **BR-LEAVE:** Đơn mới `PENDING`; chỉ PENDING mới duyệt; lưu reviewer + thời điểm; ghi log.
- **BR-DASH / BR-SEC:** Dashboard theo role; log thao tác quan trọng; không ghi password/token.

### Lệch FRS (cố ý / phiên bản 1.0)

| FRS | Trạng thái | Lý do |
|-----|------------|--------|
| UI-08 / AT-13 Cấu hình địa điểm + GPS chấm công | **Chưa triển khai** | **SRS 1.0** nhấn mạnh ảnh + thời gian máy chủ; ngoài phạm vi SRS: AI khuôn mặt; GPS là mở rộng FRS — giữ backlog |
| Nhận diện khuôn mặt AI | Không làm | Ngoài phạm vi SRS/FRS |
| Báo cáo BI / xuất đa định dạng / điều chỉnh chấm công | Không làm | Ngoài phạm vi |
| Copy marketing login (AI/GPS) | **Đã sửa** | Khớp SRS: ảnh trực tiếp + server time |

---

## User Stories (đề bài)

| # | User Story |
|---|------------|
| 1 | Là người dùng, tôi muốn đăng nhập bằng tài khoản của mình. |
| 2 | Là người dùng, tôi muốn đăng xuất an toàn. |
| 3 | Là Admin, tôi muốn quản lý tài khoản và phân quyền. |
| 4 | Là Admin, tôi muốn quản lý hồ sơ nhân viên toàn công ty. |
| 5 | Là Admin, tôi muốn quản lý phòng ban và người phụ trách. |
| 6 | Là Manager, tôi muốn xem nhân viên thuộc phạm vi quản lý. |
| 7 | Là Manager, tôi muốn tạo và giao công việc. |
| 8 | Là Employee, tôi muốn xem và cập nhật tiến độ công việc được giao. |
| 9 | Là Employee, tôi muốn chấm công vào/ra kèm ảnh chụp trực tiếp. |
| 10 | Là Employee, tôi muốn xem lịch sử chấm công của bản thân. |
| 11 | Là Manager, tôi muốn tra cứu chấm công trong phạm vi quản lý. |
| 12 | Là Employee, tôi muốn gửi đơn nghỉ phép và theo dõi kết quả. |
| 13 | Là Manager/Admin, tôi muốn phê duyệt hoặc từ chối đơn nghỉ phép. |
| 14 | Là người dùng, tôi muốn xem Dashboard theo vai trò. |
| 15 | Là Admin, tôi muốn tra cứu nhật ký thao tác quan trọng. |
| 16 | Là Employee, tôi muốn cập nhật một số thông tin hồ sơ cá nhân được phép. |

---

## Kiểm thử đã chạy (self-test)

### API

```bash
node scripts/api-selftest.mjs          # Admin/Employee SRS acceptance
node scripts/manager_api_selftest.mjs  # Manager + Admin compat
```

Kết quả gần nhất: **api-selftest PASS=40 FAIL=0 SKIP=2** · **manager_api PASS=48 FAIL=0**.

### Selenium UI (full luồng Admin → Manager → Employee)

```bash
# Terminal 1–2: backend + frontend đang chạy
python scripts/full_ui_selenium_test.py
# (tuỳ chọn) suite cũ theo role:
python scripts/ui_selenium_test.py
python scripts/manager_ui_selenium_test.py
```

Kết quả gần nhất (`full_ui_selenium_test.py`): **PASS=56 · FAIL=0** — bad login, toàn bộ màn Admin/Manager/Employee (EMP-01…06), tạo task/leave, chi tiết, RBAC chặn `/users` `/logs`, logout từng role.

Kết quả ghi tại `scripts/api-selftest-results.txt`, `scripts/manager-api-selftest-results.txt`, `scripts/full-ui-selenium-results.txt`.

---

## Chạy dự án

### Backend
```bash
cd backend
npm install
npm run start:dev
# API: http://localhost:3000/api
# Swagger: http://localhost:3000/api/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

### Tài khoản demo (seed)

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | ADMIN |
| manager | Manager@123 | MANAGER |
| employee | Employee@123 | EMPLOYEE |

---

## Bảo mật

- Mật khẩu bcrypt; JWT `httpOnly` + `sameSite`.
- CSRF `X-CSRF-Token`; CORS theo origin FE.
- RolesGuard trên API; FE `RoleRoute` + ẩn menu theo role (không thay thế backend).
- Ảnh chấm công private, không URL công khai tới file storage.
- Không lưu token trong `localStorage`; không log dữ liệu nhạy cảm.

---

## Cấu trúc

```
/
├── LICENSE
├── README.md
├── scripts/                 # api-selftest.mjs, ui_selenium_test.py
├── backend/src/             # auth, users, employees, departments, tasks,
│                            # attendance, leave, dashboard, system-logs
└── frontend/src/pages/      # 19 màn + Logs
```

Chi tiết SRS/FRS gốc: tài liệu nhóm (SRS + FRS phiên bản 1.0). README này là bản **đối chiếu triển khai** với code hiện tại.
