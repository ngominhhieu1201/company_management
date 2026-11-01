import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import {
  AccountStatus,
  TaskStatus,
  UserRole,
} from '../common/enums';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Task } from '../tasks/task.entity';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UnlockRequestDto,
  UpdateUserDto,
} from './dto/user.dto';
import { User } from './user.entity';

const ONLINE_MS = 30 * 60 * 1000;

export type AuthUser = {
  id: number;
  role: UserRole;
  employeeId: number | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(AttendanceRecord)
    private readonly attendance: Repository<AttendanceRecord>,
    private readonly logs: SystemLogsService,
  ) {}

  toPublic(user: User) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      employeeId: user.employeeId,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private uid(id: number) {
    return `ACC-${String(id).padStart(5, '0')}`;
  }

  private isOnline(lastLoginAt: Date | null) {
    if (!lastLoginAt) return false;
    return Date.now() - new Date(lastLoginAt).getTime() < ONLINE_MS;
  }

  async managedDepartmentIds(user: AuthUser): Promise<number[]> {
    if (!user.employeeId) return [];
    const depts = await this.departments.find({
      where: { managerEmployeeId: user.employeeId },
    });
    return depts.map((d) => d.id);
  }

  private async filterRowsForActor<
    T extends { id: number; employee?: { departmentId?: number | null } | null },
  >(rows: T[], actor: AuthUser): Promise<T[]> {
    if (actor.role === UserRole.ADMIN) return rows;
    if (actor.role === UserRole.MANAGER) {
      const deptIds = await this.managedDepartmentIds(actor);
      return rows.filter(
        (r) =>
          r.id === actor.id ||
          (r.employee?.departmentId != null &&
            deptIds.includes(r.employee.departmentId)),
      );
    }
    return rows;
  }

  async assertCanView(userId: number, actor: AuthUser) {
    if (actor.role === UserRole.ADMIN) return;
    if (userId === actor.id) return;
    if (actor.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.employeeId) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const emp = await this.employees.findOne({
      where: { id: user.employeeId },
    });
    const deptIds = await this.managedDepartmentIds(actor);
    if (
      emp?.departmentId != null &&
      deptIds.includes(emp.departmentId)
    ) {
      return;
    }
    throw new ForbiddenException('Insufficient permissions');
  }

  private async countPendingUnlockRequests(
    actor: AuthUser,
    visibleUserIds: number[],
  ) {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const ids =
      actor.role === UserRole.MANAGER ? visibleUserIds : undefined;
    if (ids?.length === 0) return 0;
    return this.logs.countUnlockRequestsSince(since, ids);
  }

  async findByUsername(username: string) {
    return this.repo.findOne({ where: { username } });
  }

  /** Đăng nhập bằng username hoặc email công vụ (@nexora.work) */
  async findByLoginIdentifier(identifier: string) {
    let raw = identifier.trim();
    // UI từng có prefix "@" — chấp nhận "@admin" như "admin"
    if (raw.startsWith('@') && !raw.includes('.', raw.indexOf('@') + 1)) {
      const maybeUser = raw.slice(1).trim();
      if (maybeUser && !maybeUser.includes('@')) raw = maybeUser;
    }
    const byUsername = await this.findByUsername(raw);
    if (byUsername) return byUsername;

    if (raw.includes('@')) {
      const emp = await this.employees.findOne({
        where: { email: raw.toLowerCase() },
      });
      if (emp) {
        return this.repo.findOne({ where: { employeeId: emp.id } });
      }
    }
    return null;
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async recordLogin(userId: number, ip: string | null) {
    await this.repo.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
  }

  private async enrich(users: User[]) {
    const emps = await this.employees.find();
    const depts = await this.departments.find();
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const deptMap = new Map(depts.map((d) => [d.id, d]));

    return users.map((u) => {
      const emp = u.employeeId ? empMap.get(u.employeeId) : undefined;
      const dept =
        emp?.departmentId != null ? deptMap.get(emp.departmentId) : undefined;
      return {
        ...this.toPublic(u),
        uid: this.uid(u.id),
        online: this.isOnline(u.lastLoginAt),
        employee: emp
          ? {
              id: emp.id,
              fullName: emp.fullName,
              employeeCode: emp.employeeCode,
              email: emp.email,
              phone: emp.phone,
              position: emp.position,
              hireDate: emp.hireDate,
              status: emp.status,
              departmentId: emp.departmentId,
              departmentName: dept?.name ?? null,
            }
          : null,
        workEmail: emp?.email ?? null,
      };
    });
  }

  permissionsFor(role: UserRole) {
    const base = [
      'Xem dashboard theo vai trò',
      'Chấm công cá nhân',
      'Gửi / theo dõi đơn nghỉ phép',
      'Xem & cập nhật công việc được giao',
    ];
    if (role === UserRole.EMPLOYEE) return base;
    if (role === UserRole.MANAGER) {
      return [
        ...base,
        'Xem nhân sự trong phạm vi phòng ban',
        'Giao / theo dõi công việc team',
        'Duyệt nghỉ phép trong phạm vi quản lý',
        'Xem chấm công nhân viên thuộc phạm vi',
      ];
    }
    return [
      'Quản trị hệ thống (toàn quyền module)',
      'Quản lý & kích hoạt/khóa tài khoản',
      'Quản lý nhân sự toàn công ty',
      'Quản lý phòng ban',
      'Quản lý công việc / chấm công / nghỉ phép',
      'Xem nhật ký hệ thống (audit)',
    ];
  }

  async findDetail(id: number, actor?: AuthUser) {
    if (actor) await this.assertCanView(id, actor);
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const [row] = await this.enrich([user]);
    let attendanceHours = 0;
    let taskTotal = 0;
    let taskInProgress = 0;
    if (user.employeeId) {
      const records = await this.attendance.find({
        where: { employeeId: user.employeeId },
      });
      for (const r of records) {
        if (r.checkInTime && r.checkOutTime) {
          const ms =
            new Date(r.checkOutTime).getTime() -
            new Date(r.checkInTime).getTime();
          if (ms > 0) attendanceHours += ms / 3600000;
        }
      }
      const myTasks = await this.tasks.find({
        where: { assigneeId: user.employeeId },
      });
      taskTotal = myTasks.length;
      taskInProgress = myTasks.filter(
        (t) =>
          t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.REVIEW,
      ).length;
    }
    return {
      ...row,
      permissions: this.permissionsFor(user.role),
      activity: {
        attendanceHours: Math.round(attendanceHours * 10) / 10,
        taskTotal,
        taskInProgress,
      },
      session: {
        lastLoginAt: user.lastLoginAt,
        lastLoginIp: user.lastLoginIp,
        online: this.isOnline(user.lastLoginAt),
        twoFactorEnabled: false,
      },
    };
  }

  async audit(id: number, limit = 50, actor?: AuthUser) {
    if (actor) await this.assertCanView(id, actor);
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const logs = await this.logs.findForAccount(id, limit);
    const actorIds = [
      ...new Set(
        logs
          .map((l) => l.actorUserId)
          .filter((x): x is number => x != null),
      ),
    ];
    const actors =
      actorIds.length > 0
        ? await this.repo.find({ where: { id: In(actorIds) } })
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
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: meta,
      };
    });
  }

  private genTempPassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '@#$%';
    const all = upper + lower + digits + special;
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    let out = pick(upper) + pick(lower) + pick(digits) + pick(special);
    for (let i = 0; i < 8; i += 1) out += pick(all);
    return out
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  async resetPassword(id: number, actorId?: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const temporaryPassword = this.genTempPassword();
    user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await this.repo.save(user);
    await this.logs.log({
      actorUserId: actorId,
      action: 'USER_RESET_PASSWORD',
      entityType: 'User',
      entityId: user.id,
      metadata: { username: user.username },
    });
    return { id: user.id, username: user.username, temporaryPassword };
  }

  async findAll(query: ListUsersQueryDto = {}, actor?: AuthUser) {
    const users = await this.repo.find({ order: { id: 'ASC' } });
    let rows = await this.enrich(users);
    if (actor) {
      rows = await this.filterRowsForActor(rows, actor);
    }

    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.username,
          r.uid,
          r.workEmail,
          r.employee?.fullName,
          r.employee?.employeeCode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (query.role) rows = rows.filter((r) => r.role === query.role);
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    if (query.departmentId != null) {
      rows = rows.filter(
        (r) => r.employee?.departmentId === query.departmentId,
      );
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const total = rows.length;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async stats(actor?: AuthUser) {
    let users = await this.repo.find();
    if (actor && actor.role === UserRole.MANAGER) {
      const enriched = await this.enrich(users);
      const scoped = await this.filterRowsForActor(enriched, actor);
      const scopedIds = new Set(scoped.map((r) => r.id));
      users = users.filter((u) => scopedIds.has(u.id));
    }
    const emps = await this.employees.find();
    const empMap = new Map(emps.map((e) => [e.id, e]));

    const total = users.length;
    const active = users.filter((u) => u.status === AccountStatus.ACTIVE)
      .length;
    const locked = users.filter((u) => u.status === AccountStatus.LOCKED)
      .length;
    const adminCount = users.filter((u) => u.role === UserRole.ADMIN).length;
    const managerCount = users.filter((u) => u.role === UserRole.MANAGER)
      .length;
    const privileged = adminCount + managerCount;

    const withEmployee = users.filter((u) => u.employeeId != null).length;
    const coveragePct =
      total > 0 ? Math.round((withEmployee / total) * 1000) / 10 : 0;
    const availabilityPct =
      total > 0 ? Math.round((active / total) * 1000) / 10 : 0;

    let lockedInactiveEmp = 0;
    for (const u of users) {
      if (u.status !== AccountStatus.LOCKED) continue;
      const emp = u.employeeId ? empMap.get(u.employeeId) : undefined;
      if (emp && emp.status !== 'ACTIVE') lockedInactiveEmp += 1;
    }
    const lockedOther = locked - lockedInactiveEmp;

    const visibleUserIds = users.map((u) => u.id);
    const pendingUnlockRequests = actor
      ? await this.countPendingUnlockRequests(actor, visibleUserIds)
      : await this.countPendingUnlockRequests(
          { id: 0, role: UserRole.ADMIN, employeeId: null },
          visibleUserIds,
        );

    return {
      total,
      active,
      locked,
      privileged,
      adminCount,
      managerCount,
      coveragePct,
      availabilityPct,
      lockedInactiveEmp,
      lockedOther,
      pendingUnlockRequests,
    };
  }

  async requestUnlock(
    id: number,
    actor: AuthUser,
    dto: UnlockRequestDto,
  ) {
    await this.assertCanView(id, actor);
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== AccountStatus.LOCKED) {
      throw new BadRequestException('Account is not locked');
    }
    const year = new Date().getFullYear();
    const ticketCode = `TK-${year}-${id}`;
    await this.logs.log({
      actorUserId: actor.id,
      action: 'USER_UNLOCK_REQUEST',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        reason: dto.reason.trim(),
        urgency: dto.urgency?.trim() || null,
        ticketCode,
        targetUsername: user.username,
      },
    });
    return { ok: true, ticketCode };
  }

  async getProfile(actor: AuthUser) {
    const user = await this.findById(actor.id);
    if (!user) throw new NotFoundException('User not found');
    const [row] = await this.enrich([user]);
    let managedHeadcount: number | null = null;
    if (actor.role === UserRole.MANAGER) {
      const deptIds = await this.managedDepartmentIds(actor);
      if (deptIds.length > 0) {
        managedHeadcount = await this.employees.count({
          where: { departmentId: In(deptIds) },
        });
      } else {
        managedHeadcount = 0;
      }
    }
    return {
      ...row,
      managedHeadcount,
    };
  }

  async changePassword(
    actorId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.findById(actorId);
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.repo.save(user);
    await this.logs.log({
      actorUserId: actorId,
      action: 'USER_CHANGE_PASSWORD',
      entityType: 'User',
      entityId: user.id,
      metadata: { username: user.username },
    });
    return { ok: true };
  }

  async checkUsername(username: string) {
    const raw = (username || '').trim().toLowerCase();
    if (raw.length < 3) {
      return { available: false, reason: 'TOO_SHORT' as const };
    }
    if (!/^[a-z0-9._-]+$/.test(raw)) {
      return { available: false, reason: 'INVALID' as const };
    }
    const exists = await this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.username) = :raw', { raw })
      .getOne();
    return {
      available: !exists,
      reason: exists ? ('TAKEN' as const) : ('OK' as const),
    };
  }

  async listUnlinkedEmployees() {
    const users = await this.repo.find();
    const linked = new Set(
      users
        .map((u) => u.employeeId)
        .filter((id): id is number => id != null),
    );
    const emps = await this.employees.find({ order: { id: 'ASC' } });
    const depts = await this.departments.find();
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    return emps
      .filter((e) => !linked.has(e.id))
      .map((e) => {
        const dept =
          e.departmentId != null ? deptMap.get(e.departmentId) : undefined;
        return {
          id: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          email: e.email,
          phone: e.phone,
          position: e.position,
          status: e.status,
          departmentId: e.departmentId,
          departmentName: dept?.name ?? null,
        };
      });
  }

  async create(dto: CreateUserDto, actorId?: number) {
    const check = await this.checkUsername(dto.username);
    if (!check.available) {
      throw new BadRequestException(
        check.reason === 'TAKEN'
          ? 'Username already exists'
          : 'Username is invalid',
      );
    }
    if (dto.employeeId != null) {
      const emp = await this.employees.findOne({
        where: { id: dto.employeeId },
      });
      if (!emp) throw new BadRequestException('Employee not found');
      const linked = await this.repo.findOne({
        where: { employeeId: dto.employeeId },
      });
      if (linked) {
        throw new BadRequestException('Employee already linked to an account');
      }
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({
      username: dto.username.trim().toLowerCase(),
      passwordHash,
      role: dto.role,
      status: dto.status ?? AccountStatus.ACTIVE,
      employeeId: dto.employeeId ?? null,
      lastLoginAt: null,
      lastLoginIp: null,
    });
    const saved = await this.repo.save(user);
    await this.logs.log({
      actorUserId: actorId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: saved.id,
      metadata: {
        username: saved.username,
        role: saved.role,
        status: saved.status,
      },
    });
    const [row] = await this.enrich([saved]);
    return row;
  }

  async update(id: number, dto: UpdateUserDto, actorId?: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const prevRole = user.role;
    const prevStatus = user.status;
    if (dto.role && dto.role !== user.role) {
      if (!dto.reason || dto.reason.trim().length < 3) {
        throw new BadRequestException(
          'Reason is required when changing role (min 3 chars)',
        );
      }
    }
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.role) user.role = dto.role;
    if (dto.status) user.status = dto.status;
    if (dto.employeeId !== undefined) {
      if (dto.employeeId != null) {
        const emp = await this.employees.findOne({
          where: { id: dto.employeeId },
        });
        if (!emp) throw new BadRequestException('Employee not found');
        const linked = await this.repo.findOne({
          where: { employeeId: dto.employeeId },
        });
        if (linked && linked.id !== id) {
          throw new BadRequestException(
            'Employee already linked to an account',
          );
        }
      }
      user.employeeId = dto.employeeId;
    }
    const saved = await this.repo.save(user);
    const roleChanged = dto.role && dto.role !== prevRole;
    await this.logs.log({
      actorUserId: actorId,
      action: roleChanged
        ? 'USER_ROLE_CHANGE'
        : dto.status && dto.status !== prevStatus
          ? 'USER_STATUS_CHANGE'
          : 'USER_UPDATE',
      entityType: 'User',
      entityId: saved.id,
      metadata: {
        role: saved.role,
        status: saved.status,
        prevRole,
        prevStatus,
        reason: dto.reason?.trim() || null,
      },
    });
    const [row] = await this.enrich([saved]);
    return row;
  }
}
