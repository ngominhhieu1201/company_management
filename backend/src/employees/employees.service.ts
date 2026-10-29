import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { In, Repository } from 'typeorm';
import {
  AccountStatus,
  EmployeeStatus,
  LeaveStatus,
  TaskStatus,
  UserRole,
} from '../common/enums';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { Employee } from './employee.entity';

/** Ngày phép năm mặc định theo mock nghiệp vụ (không có bảng quota riêng) */
const ANNUAL_LEAVE_DAYS = 12;

type AuthUser = {
  id: number;
  role: UserRole;
  employeeId: number | null;
};

@Injectable()
export class EmployeesService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'employees');

  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(AttendanceRecord)
    private readonly attendance: Repository<AttendanceRecord>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
    private readonly logs: SystemLogsService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private async managedDepartmentIds(user: AuthUser): Promise<number[]> {
    if (!user.employeeId) return [];
    const depts = await this.deptRepo.find({
      where: { managerEmployeeId: user.employeeId },
    });
    return depts.map((d) => d.id);
  }

  private async scoped(user: AuthUser) {
    let list = await this.repo.find({ order: { id: 'ASC' } });
    if (user.role === UserRole.EMPLOYEE) {
      list = list.filter((e) => e.id === user.employeeId);
    } else if (user.role === UserRole.MANAGER) {
      const deptIds = await this.managedDepartmentIds(user);
      list = list.filter(
        (e) =>
          e.id === user.employeeId ||
          (e.departmentId != null && deptIds.includes(e.departmentId)),
      );
    }
    return list;
  }

  private async enrich(emps: Employee[]) {
    const depts = await this.deptRepo.find();
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const allEmps = await this.repo.find();
    const nameMap = new Map(allEmps.map((e) => [e.id, e.fullName]));
    const users = await this.users.find();
    const byEmp = new Map(
      users
        .filter((u) => u.employeeId != null)
        .map((u) => [u.employeeId as number, u]),
    );

    return emps.map((e) => {
      const dept =
        e.departmentId != null ? deptMap.get(e.departmentId) : undefined;
      const acc = byEmp.get(e.id);
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        email: e.email,
        phone: e.phone,
        departmentId: e.departmentId,
        departmentName: dept?.name ?? null,
        position: e.position,
        hireDate: e.hireDate,
        dateOfBirth: e.dateOfBirth,
        gender: e.gender,
        nationalId: e.nationalId,
        permanentAddress: e.permanentAddress,
        temporaryAddress: e.temporaryAddress,
        managerEmployeeId: e.managerEmployeeId,
        managerName:
          e.managerEmployeeId != null
            ? (nameMap.get(e.managerEmployeeId) ?? null)
            : null,
        contractType: e.contractType,
        photoKey: e.photoKey,
        status: e.status,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        account: acc
          ? {
              id: acc.id,
              username: acc.username,
              role: acc.role,
              status: acc.status,
              linked: true as const,
              locked: acc.status === AccountStatus.LOCKED,
            }
          : { linked: false as const },
      };
    });
  }

  async nextCode() {
    const year = new Date().getFullYear();
    const prefix = `NV-${year}-`;
    const all = await this.repo.find();
    let max = 0;
    for (const e of all) {
      if (!e.employeeCode.startsWith(prefix)) continue;
      const n = Number(e.employeeCode.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    const next = String(max + 1).padStart(3, '0');
    return { employeeCode: `${prefix}${next}`, year, sequence: max + 1 };
  }

  private savePhoto(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo is required');
    }
    const mime = file.mimetype || '';
    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(mime)) {
      throw new BadRequestException('Photo must be JPG/PNG/WEBP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Photo must be under 5MB');
    }
    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `emp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    writeFileSync(join(this.uploadDir, key), file.buffer);
    return key;
  }

  async uploadPhoto(id: number, file: Express.Multer.File, user: AuthUser) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException();
    }
    emp.photoKey = this.savePhoto(file);
    const saved = await this.repo.save(emp);
    await this.logs.log({
      actorUserId: user.id,
      action: 'EMPLOYEE_PHOTO_UPLOAD',
      entityType: 'Employee',
      entityId: saved.id,
    });
    const [row] = await this.enrich([saved]);
    return row;
  }

  async getPhotoStream(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    const path = join(this.uploadDir, safe);
    if (!existsSync(path)) throw new NotFoundException('Photo not found');
    return createReadStream(path);
  }

  async stats(user: AuthUser) {
    const list = await this.scoped(user);
    const total = list.length;
    const active = list.filter((e) => e.status === EmployeeStatus.ACTIVE)
      .length;
    const inactive = list.filter(
      (e) =>
        e.status === EmployeeStatus.INACTIVE ||
        e.status === EmployeeStatus.SUSPENDED,
    ).length;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newLast30Days = list.filter((e) => {
      const t = e.hireDate
        ? new Date(e.hireDate).getTime()
        : e.createdAt
          ? new Date(e.createdAt).getTime()
          : 0;
      return t >= cutoff;
    }).length;
    return { total, active, inactive, newLast30Days };
  }

  async findAll(user: AuthUser, query: ListEmployeesQueryDto = {}) {
    let list = await this.scoped(user);
    const q = query.q?.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.phone && e.phone.toLowerCase().includes(q)) ||
          (e.position && e.position.toLowerCase().includes(q)),
      );
    }
    if (query.departmentId != null) {
      list = list.filter((e) => e.departmentId === query.departmentId);
    }
    if (query.status) {
      list = list.filter((e) => e.status === query.status);
    }

    const sort = query.sort || 'code_asc';
    list = [...list].sort((a, b) => {
      if (sort === 'name_asc')
        return a.fullName.localeCompare(b.fullName, 'vi');
      if (sort === 'name_desc')
        return b.fullName.localeCompare(a.fullName, 'vi');
      if (sort === 'hire_desc') {
        return String(b.hireDate || '').localeCompare(String(a.hireDate || ''));
      }
      if (sort === 'hire_asc') {
        return String(a.hireDate || '').localeCompare(String(b.hireDate || ''));
      }
      return a.employeeCode.localeCompare(b.employeeCode, 'vi');
    });

    const enriched = await this.enrich(list);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const total = enriched.length;
    const start = (page - 1) * pageSize;
    const items = enriched.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Dùng cho dropdown (tasks…) — toàn bộ trong scope, không paginate */
  async findOptions(user: AuthUser) {
    const list = await this.scoped(user);
    return list.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      email: e.email,
      departmentId: e.departmentId,
      status: e.status,
    }));
  }

  private async assertCanView(emp: Employee, user: AuthUser) {
    if (user.role === UserRole.EMPLOYEE && emp.id !== user.employeeId) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.MANAGER) {
      const deptIds = await this.managedDepartmentIds(user);
      if (
        emp.id !== user.employeeId &&
        (emp.departmentId == null || !deptIds.includes(emp.departmentId))
      ) {
        throw new ForbiddenException();
      }
    }
  }

  private maskNationalId(raw: string | null) {
    if (!raw) return null;
    if (raw.length <= 4) return '****';
    const visible = raw.slice(0, 6);
    return `${visible}${'*'.repeat(Math.min(6, raw.length - 6))}`;
  }

  private seniorityLabel(hireDate: string | null) {
    if (!hireDate) return null;
    const start = new Date(hireDate);
    if (Number.isNaN(start.getTime())) return null;
    const now = new Date();
    let months =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    if (months < 0) months = 0;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return `${rem} tháng`;
    if (rem === 0) return `${years} năm`;
    return `${years} năm ${rem} tháng`;
  }

  private workingDaysInMonth(year: number, monthIndex: number) {
    const days = new Date(year, monthIndex + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= days; d += 1) {
      const wd = new Date(year, monthIndex, d).getDay();
      if (wd !== 0 && wd !== 6) count += 1;
    }
    return count;
  }

  private daySpan(start: string, end: string) {
    const a = new Date(start);
    const b = new Date(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const ms = b.getTime() - a.getTime();
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  }

  private progressFromStatus(status: TaskStatus) {
    switch (status) {
      case TaskStatus.TODO:
        return 12;
      case TaskStatus.IN_PROGRESS:
        return 45;
      case TaskStatus.REVIEW:
        return 78;
      case TaskStatus.DONE:
        return 100;
      default:
        return 0;
    }
  }

  async findOne(id: number, user: AuthUser) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.assertCanView(emp, user);
    const [row] = await this.enrich([emp]);

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const expectedDays = this.workingDaysInMonth(y, m);

    const att = await this.attendance.find({
      where: { employeeId: emp.id },
    });
    const attendedDays = new Set(
      att
        .filter((r) => String(r.workDate).startsWith(monthPrefix) && r.checkInTime)
        .map((r) => String(r.workDate).slice(0, 10)),
    ).size;

    const myTasks = await this.tasks.find({
      where: { assigneeId: emp.id },
    });
    const taskTotal = myTasks.length;
    const avgProgress =
      taskTotal === 0
        ? 0
        : Math.round(
            myTasks.reduce(
              (s, t) => s + this.progressFromStatus(t.status),
              0,
            ) / taskTotal,
          );

    const leaves = await this.leaveRepo.find({
      where: { employeeId: emp.id, status: LeaveStatus.APPROVED },
    });
    const usedLeave = leaves
      .filter((l) => String(l.startDate).startsWith(String(y)))
      .reduce((s, l) => s + this.daySpan(l.startDate, l.endDate), 0);
    const leaveRemaining = Math.max(0, ANNUAL_LEAVE_DAYS - usedLeave);

    const canSeeNationalId =
      user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;

    return {
      ...row,
      nationalIdMasked: this.maskNationalId(emp.nationalId),
      nationalId: canSeeNationalId ? emp.nationalId : undefined,
      seniority: this.seniorityLabel(emp.hireDate),
      metrics: {
        year: y,
        month: m + 1,
        label: `T${String(m + 1).padStart(2, '0')}/${y}`,
        attendanceDays: attendedDays,
        attendanceExpected: expectedDays,
        attendancePct:
          expectedDays > 0
            ? Math.round((attendedDays / expectedDays) * 1000) / 10
            : 0,
        taskTotal,
        taskProgressPct: avgProgress,
        leaveUsed: usedLeave,
        leaveQuota: ANNUAL_LEAVE_DAYS,
        leaveRemaining,
        leaveRemainingPct:
          ANNUAL_LEAVE_DAYS > 0
            ? Math.round((leaveRemaining / ANNUAL_LEAVE_DAYS) * 1000) / 10
            : 0,
      },
    };
  }

  async audit(id: number, user: AuthUser, limit = 40) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.assertCanView(emp, user);
    const logs = await this.logs.findForEntity('Employee', id, limit);
    const actorIds = [
      ...new Set(
        logs
          .map((l) => l.actorUserId)
          .filter((x): x is number => x != null),
      ),
    ];
    const actors =
      actorIds.length > 0
        ? await this.users.find({ where: { id: In(actorIds) } })
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.username]));
    return logs.map((l) => {
      let meta: Record<string, unknown> | null = null;
      if (l.metadata) {
        try {
          meta = JSON.parse(l.metadata) as Record<string, unknown>;
        } catch {
          meta = { raw: l.metadata };
        }
      }
      return {
        id: l.id,
        createdAt: l.createdAt,
        action: l.action,
        result: l.result,
        actorUserId: l.actorUserId,
        actorUsername:
          l.actorUserId != null
            ? (actorMap.get(l.actorUserId) ?? `user#${l.actorUserId}`)
            : 'SYSTEM',
        metadata: meta,
      };
    });
  }

  async create(dto: CreateEmployeeDto, actorId?: number) {
    const exists = await this.repo.findOne({
      where: { employeeCode: dto.employeeCode },
    });
    if (exists) throw new BadRequestException('Employee code exists');
    if (dto.departmentId != null) {
      const dept = await this.deptRepo.findOne({
        where: { id: dto.departmentId },
      });
      if (!dept) throw new BadRequestException('Department not found');
    }
    if (dto.managerEmployeeId != null) {
      const mgr = await this.repo.findOne({
        where: { id: dto.managerEmployeeId },
      });
      if (!mgr) throw new BadRequestException('Manager employee not found');
    }
    if (dto.nationalId) {
      const dup = await this.repo.findOne({
        where: { nationalId: dto.nationalId },
      });
      if (dup) throw new BadRequestException('nationalId already used');
    }
    const saved = await this.repo.save(
      this.repo.create({
        employeeCode: dto.employeeCode.trim(),
        fullName: dto.fullName.trim(),
        email: dto.email?.trim() || '',
        phone: dto.phone?.trim() || '',
        departmentId: dto.departmentId ?? null,
        position: dto.position?.trim() || '',
        hireDate: dto.hireDate || null,
        dateOfBirth: dto.dateOfBirth || null,
        gender: dto.gender ?? null,
        nationalId: dto.nationalId?.trim() || null,
        permanentAddress: dto.permanentAddress?.trim() || null,
        temporaryAddress: dto.temporaryAddress?.trim() || null,
        managerEmployeeId: dto.managerEmployeeId ?? null,
        contractType: dto.contractType ?? null,
        photoKey: null,
        status: dto.status ?? EmployeeStatus.ACTIVE,
      }),
    );
    await this.logs.log({
      actorUserId: actorId,
      action: 'EMPLOYEE_CREATE',
      entityType: 'Employee',
      entityId: saved.id,
      metadata: {
        employeeCode: saved.employeeCode,
        contractType: saved.contractType,
      },
    });
    const [row] = await this.enrich([saved]);
    return row;
  }

  async update(id: number, dto: UpdateEmployeeDto, user: AuthUser) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.assertCanView(emp, user);
    const prevStatus = emp.status;
    const prevPosition = emp.position;

    if (user.role === UserRole.EMPLOYEE) {
      if (dto.phone !== undefined) emp.phone = dto.phone;
      if (dto.email !== undefined) emp.email = dto.email;
      if (dto.temporaryAddress !== undefined)
        emp.temporaryAddress = dto.temporaryAddress;
    } else {
      if (dto.fullName !== undefined) emp.fullName = dto.fullName;
      if (dto.email !== undefined) emp.email = dto.email;
      if (dto.phone !== undefined) emp.phone = dto.phone;
      if (dto.position !== undefined) emp.position = dto.position;
      if (dto.hireDate !== undefined) emp.hireDate = dto.hireDate;
      if (dto.dateOfBirth !== undefined) emp.dateOfBirth = dto.dateOfBirth;
      if (dto.gender !== undefined) emp.gender = dto.gender;
      if (dto.nationalId !== undefined) emp.nationalId = dto.nationalId;
      if (dto.permanentAddress !== undefined)
        emp.permanentAddress = dto.permanentAddress;
      if (dto.temporaryAddress !== undefined)
        emp.temporaryAddress = dto.temporaryAddress;
      if (dto.contractType !== undefined) emp.contractType = dto.contractType;
      if (dto.managerEmployeeId !== undefined) {
        if (dto.managerEmployeeId != null) {
          const mgr = await this.repo.findOne({
            where: { id: dto.managerEmployeeId },
          });
          if (!mgr) throw new BadRequestException('Manager employee not found');
        }
        emp.managerEmployeeId = dto.managerEmployeeId;
      }
      if (dto.status !== undefined) emp.status = dto.status;
      if (dto.departmentId !== undefined) {
        if (dto.departmentId != null) {
          const dept = await this.deptRepo.findOne({
            where: { id: dto.departmentId },
          });
          if (!dept) throw new BadRequestException('Department not found');
        }
        emp.departmentId = dto.departmentId;
      }
    }

    const saved = await this.repo.save(emp);
    const statusChanged = dto.status && dto.status !== prevStatus;
    const positionChanged =
      dto.position !== undefined && dto.position !== prevPosition;
    await this.logs.log({
      actorUserId: user.id,
      action: statusChanged
        ? 'EMPLOYEE_STATUS_CHANGE'
        : positionChanged
          ? 'EMPLOYEE_POSITION_CHANGE'
          : 'EMPLOYEE_UPDATE',
      entityType: 'Employee',
      entityId: saved.id,
      metadata: {
        status: saved.status,
        prevStatus,
        position: saved.position,
        prevPosition,
      },
    });
    return this.findOne(saved.id, user);
  }
}
