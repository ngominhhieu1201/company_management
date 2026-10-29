# Ghi chú kỹ thuật phục vụ báo cáo (Câu 3d, 4c, 6b)

## 6b — Quy trình ORM (TypeORM)

1. **Kết nối:** `TypeOrmModule.forRoot` trong `AppModule` mở SQLite (`company.db`), `synchronize: true` (dev), `autoLoadEntities: true`.
2. **Entity → bảng:** mỗi class `@Entity()` map cột `@Column()`, quan hệ `@ManyToOne` / `@OneToMany`, khóa `@PrimaryGeneratedColumn`.
3. **Repository:** inject `Repository<T>` qua `@InjectRepository` trong Service.
4. **Truy vấn điển hình:**
   - `find` / `findOne` — danh sách, chi tiết có filter theo role.
   - `save` — tạo/cập nhật (user, task, leave…).
   - `createQueryBuilder` — dashboard aggregate, scope phòng ban.
   - Transaction (attendance): kiểm tra bản ghi theo `(employeeId, workDate)` rồi insert/update tránh trùng.
5. **Luồng phân lớp:** Controller nhận HTTP → DTO validate → Service nghiệp vụ → Repository/ORM → DB.

## 3d / 4c — An ninh

| Cơ chế | Cách làm |
|--------|----------|
| Token | JWT trong cookie `httpOnly` `access_token` |
| Mã băm mật khẩu | bcrypt khi tạo/đổi user |
| Phiên / Cookie | cookie-parser; clear khi logout |
| CORS | chỉ origin frontend, `credentials: true` |
| CSRF (XOR/double-submit) | cookie `csrf_token` + header `X-CSRF-Token` |
| Xác thực / định danh | JwtStrategy đọc cookie → `req.user`; RolesGuard |
| Frontend không lộ data | không lưu token localStorage; không log PII; photo qua API có auth |

## Luồng thông tin chính (3b — tóm tắt)

```
Login → JWT+CSRF cookie → Dashboard theo role
Admin: Users / Employees / Departments → System logs
Manager: Tasks assign → Approve leave → Xem attendance scope
Employee: Tasks update → Attendance camera → Leave request
```
