# Hệ thống Quản lý Công ty (Company Management System)

Ứng dụng web quản lý nội bộ doanh nghiệp — môn **Web nâng cao**, Đại học Phenikaa.

**Stack:** NestJS (backend phân lớp) + React + react-bootstrap (frontend) + TypeORM + SQLite.

---

## Yêu cầu đề bài liên quan đến code (đã lọc)

Các mục **không liên quan code** (báo cáo cứng/PDF, điểm chuyên cần, thảo luận lớp, luật/đạo đức văn bản, ký danh sách nộp…) **không** ghi vào đây — làm riêng trong báo cáo.

### Câu 1 — User Stories (tối thiểu 12–16)
Định dạng: *Là [vai trò], tôi muốn [hành động].*

| # | User Story |
|---|------------|
| 1 | Là người dùng, tôi muốn đăng nhập vào hệ thống bằng tài khoản của mình. |
| 2 | Là người dùng, tôi muốn đăng xuất để kết thúc phiên làm việc an toàn. |
| 3 | Là người quản trị, tôi muốn quản lý tài khoản và phân quyền theo vai trò. |
| 4 | Là người quản trị, tôi muốn quản lý hồ sơ nhân viên toàn công ty. |
| 5 | Là người quản trị, tôi muốn quản lý phòng ban và người phụ trách. |
| 6 | Là người quản lý, tôi muốn xem nhân viên thuộc phạm vi quản lý của mình. |
| 7 | Là người quản lý, tôi muốn tạo và giao công việc cho nhân viên. |
| 8 | Là nhân viên, tôi muốn xem và cập nhật tiến độ công việc được giao. |
| 9 | Là nhân viên, tôi muốn chấm công vào/ra kèm ảnh chụp trực tiếp. |
| 10 | Là nhân viên, tôi muốn xem lịch sử chấm công của bản thân. |
| 11 | Là người quản lý, tôi muốn tra cứu chấm công nhân viên trong phạm vi quản lý. |
| 12 | Là nhân viên, tôi muốn gửi đơn nghỉ phép và theo dõi kết quả. |
| 13 | Là người quản lý, tôi muốn phê duyệt hoặc từ chối đơn nghỉ phép. |
| 14 | Là người dùng, tôi muốn xem Dashboard tổng hợp theo vai trò của mình. |
| 15 | Là người quản trị, tôi muốn tra cứu nhật ký thao tác quan trọng. |
| 16 | Là nhân viên, tôi muốn cập nhật một số thông tin hồ sơ cá nhân được phép. |

### Câu 2–3 (thiết kế / khung làm việc)
- **2a–2b:** Phân tích yêu cầu, Class Diagram, sơ đồ thuật toán → trong báo cáo (UML).
- **3a:** Wireframe giao diện chính → trong báo cáo / JustInMind.
- **3b:** Luồng xử lý thông tin chính → trong báo cáo (flowchart SRS).
- **3c:** NestJS + React, mô hình phân lớp, có tệp `LICENSE` (bản quyền).
- **3d:** Backend Security; Frontend không lộ thông tin người dùng / dữ liệu nhạy cảm khi gọi API.

### Câu 4 — API & bảo mật
- **4a:** API nghiệp vụ (auth, users, employees, departments, tasks, attendance, leave, dashboard, logs).
- **4b:** Tài liệu hóa API (Swagger tại `/api/docs`).
- **4c:** Token JWT (httpOnly cookie), bcrypt mật khẩu, session/cookie, CORS, CSRF (double-submit / X-CSRF-Token), xác thực & phân quyền RolesGuard.

### Câu 5 — Frontend
- **5a:** Layout thống nhất theo wireframe.
- **5b:** React + **react-bootstrap**.
- **5c:** Usability (ít bước tương tác, thông báo rõ, không phiền nhiễu).

### Câu 6 — ORM
- **6a:** TypeORM + CSDL quan hệ (SQLite mặc định; có thể đổi PostgreSQL).
- **6b:** Phân tích ORM / truy vấn → trong báo cáo; code nằm ở `backend/src/**/*.entity.ts` và services.

### Câu 7 — Kiểm thử
- **7a:** Validation & exception filter bắt lỗi.
- **7b:** Unit test trong `backend/src/**/*.spec.ts` và `backend/test/`.
- **7c–7e:** E2E / kiểm thử UI → chạy thủ công + báo cáo.

### Câu 8–10 (nộp bài / Git / đóng góp)
Link Demo, Github, contribution, commits — ghi trong báo cáo cứng/PDF. Không thay thế bằng README này.

---

## Cấu trúc thư mục

```
/
├── LICENSE                 # Bản quyền theo yêu cầu đề
├── README.md
├── backend/                # NestJS (Controller → Service → Repository/Entity)
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── employees/
│   │   ├── departments/
│   │   ├── tasks/
│   │   ├── attendance/
│   │   ├── leave/
│   │   ├── dashboard/
│   │   ├── system-logs/
│   │   └── common/         # guards, filters, decorators
│   └── test/
└── frontend/               # React + Vite + react-bootstrap
    └── src/
        ├── api/            # axios client (credentials, CSRF; không log token)
        ├── components/
        ├── pages/
        └── contexts/
```

## Chạy dự án

### Backend
```bash
cd backend
npm install
npm run start:dev
# API: http://localhost:3000
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

## Bảo mật đã thiết lập
- Mật khẩu băm bcrypt — không lưu plain text.
- JWT trong cookie `httpOnly` + `sameSite`.
- CSRF token header `X-CSRF-Token`.
- CORS chỉ origin frontend đã cấu hình.
- RolesGuard kiểm tra quyền từng API.
- Ảnh chấm công lưu thư mục private, phục vụ qua endpoint có auth (không public URL lộ path).
- Frontend: không lưu token trong `localStorage`; không `console.log` dữ liệu nhạy cảm; response chỉ giữ field cần hiển thị.

## Phân hệ (SRS)
| Mã | Phân hệ |
|----|---------|
| MOD-01 | Tài khoản & phân quyền |
| MOD-02 | Nhân sự & phòng ban |
| MOD-03 | Công việc |
| MOD-04 | Chấm công + ảnh |
| MOD-05 | Nghỉ phép |
| MOD-06 | Dashboard & nhật ký |

Chi tiết nghiệp vụ: xem tài liệu SRS nhóm đã cung cấp.
