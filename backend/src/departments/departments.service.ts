import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceRecord } from '../attendance/attendance.entity';
import {
  DepartmentStatus,
  EmployeeStatus,
  TaskStatus,
} from '../common/enums';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { Department } from './department.entity';
import {
  CreateDepartmentDto,
  ListDepartmentsQueryDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

const CODE_RE = /^PB-[A-Z0-9]{2,8}$/;

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly repo: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    @InjectRepository(AttendanceRecord)
    private readonly attendance: Repository<AttendanceRecord>,
    private readonly logs: SystemLogsService,
  ) {}

  private yearsActive(foundedAt: string | null) {
    if (!foundedAt) return null;
    const start = new Date(foundedAt);
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

  private empBrief(e: Employee | undefined) {
    if (!e) return null;
    return {
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      position: e.position,
      email: e.email,
      hireDate: e.hireDate,
      status: e.status,
      departmentId: e.departmentId,
    };
  }

  private async enrich(depts: Department[]) {
    const emps = await this.employees.find();
    const allDepts = await this.repo.find();
    const deptMap = new Map(allDepts.map((d) => [d.id, d]));
    const byDept = new Map<number, Employee[]>();
    for (const e of emps) {
      if (e.departmentId == null) continue;
      const list = byDept.get(e.departmentId) || [];
      list.push(e);
      byDept.set(e.departmentId, list);
    }
    const empMap = new Map(emps.map((e) => [e.id, e]));

    return depts.map((d) => {
      const members = byDept.get(d.id) || [];
      const activeMembers = members.filter(
        (m) => m.status === EmployeeStatus.ACTIVE,
      );
      const headcount = activeMembers.length;
      const target = d.headcountTarget;
      const fillPct =
        target && target > 0
          ? Math.round((headcount / target) * 1000) / 10
          : null;
      const parent =
        d.parentDepartmentId != null
          ? deptMap.get(d.parentDepartmentId)
          : undefined;
      return {
        id: d.id,
        departmentCode: d.departmentCode,
        name: d.name,
        description: d.description,
        managerEmployeeId: d.managerEmployeeId,
        manager: this.empBrief(
          d.managerEmployeeId != null
            ? empMap.get(d.managerEmployeeId)
            : undefined,
        ),
        deputyEmployeeId: d.deputyEmployeeId,
        deputy: this.empBrief(
          d.deputyEmployeeId != null
            ? empMap.get(d.deputyEmployeeId)
            : undefined,
        ),
        parentDepartmentId: d.parentDepartmentId,
        parent: parent
          ? {
              id: parent.id,
              departmentCode: parent.departmentCode,
              name: parent.name,
            }
          : null,
        headcount,
        headcountTarget: target,
        fillPct,
        foundedAt: d.foundedAt,
        yearsActive: this.yearsActive(d.foundedAt),
        location: d.location,
        contactEmail: d.contactEmail,
        category: d.category,
        recruitmentPaused: !!d.recruitmentPaused,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
  }

  private async assertEmployee(id: number | null | undefined, label: string) {
    if (id == null) return;
    const emp = await this.employees.findOne({ where: { id } });
    if (!emp) throw new BadRequestException(`${label} not found`);
  }

  private async assertParent(id: number | null | undefined, selfId?: number) {
    if (id == null) return;
    if (selfId != null && id === selfId) {
      throw new BadRequestException('Parent cannot be self');
    }
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new BadRequestException('Parent department not found');
  }

  normalizeCode(raw: string) {
    return raw.trim().toUpperCase();
  }

  validateCodeFormat(code: string) {
    return CODE_RE.test(code);
  }

  async nextCode() {
    const all = await this.repo.find();
    let max = 0;
    for (const d of all) {
      const m = /^PB-(\d+)$/.exec(d.departmentCode);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    const sequence = max + 1;
    const departmentCode = `PB-${String(sequence).padStart(3, '0')}`;
    return { departmentCode, sequence };
  }

  async checkCode(raw: string) {
    const code = this.normalizeCode(raw);
    if (!this.validateCodeFormat(code)) {
      return {
        code,
        valid: false,
        available: false,
        message: 'Mã phải dạng PB-XXXX (2–8 ký tự chữ/số sau PB-)',
      };
    }
    const exists = await this.repo.findOne({ where: { departmentCode: code } });
    if (exists) {
      return {
        code,
        valid: true,
        available: false,
        message: 'Mã đã được sử dụng',
      };
    }
    return {
      code,
      valid: true,
      available: true,
      message: 'Mã hợp lệ & khả dụng',
    };
  }

  async stats() {
    const depts = await this.repo.find();
    const rows = await this.enrich(depts);
    const total = rows.length;
    const active = rows.filter((d) => d.status === DepartmentStatus.ACTIVE)
      .length;
    const draft = rows.filter((d) => d.status === DepartmentStatus.DRAFT)
      .length;
    const headcount = rows
      .filter((d) => d.status === DepartmentStatus.ACTIVE)
      .reduce((s, d) => s + d.headcount, 0);
    const targetSum = rows
      .filter((d) => d.status === DepartmentStatus.ACTIVE)
      .reduce(
        (s, d) => s + (d.headcountTarget != null ? d.headcountTarget : 0),
        0,
      );
    const largest = [...rows]
      .filter((d) => d.status === DepartmentStatus.ACTIVE)
      .sort((a, b) => b.headcount - a.headcount)[0];
    const fillPct =
      targetSum > 0
        ? Math.round((headcount / targetSum) * 1000) / 10
        : null;
    const byCategory: Record<string, number> = {};
    for (const d of rows) {
      const key = d.category || 'OTHER';
      byCategory[key] = (byCategory[key] || 0) + 1;
    }
    return {
      total,
      active,
      draft,
      headcount,
      headcountTargetSum: targetSum || null,
      fillPct,
      largest: largest
        ? {
            id: largest.id,
            name: largest.name,
            departmentCode: largest.departmentCode,
            headcount: largest.headcount,
          }
        : null,
      byCategory,
    };
  }

  async findAll(query: ListDepartmentsQueryDto = {}) {
    const depts = await this.repo.find({ order: { id: 'ASC' } });
    let rows = await this.enrich(depts);

    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((d) => {
        const hay = [
          d.departmentCode,
          d.name,
          d.description,
          d.manager?.fullName,
          d.location,
          d.contactEmail,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (query.status) {
      rows = rows.filter((d) => d.status === query.status);
    }
    if (query.category) {
      rows = rows.filter(
        (d) => (d.category || 'OTHER') === query.category,
      );
    }

    const sort = query.sort || 'size_desc';
    rows = [...rows].sort((a, b) => {
      if (sort === 'size_asc') return a.headcount - b.headcount;
      if (sort === 'name_asc') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'code_asc')
        return a.departmentCode.localeCompare(b.departmentCode, 'vi');
      return b.headcount - a.headcount;
    });

    return rows;
  }

  private async deptMetrics(deptId: number, memberIds: number[]) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = `Tháng ${m + 1}/${y}`;

    let taskActive = 0;
    let taskOnTimePct: number | null = null;
    const taskRows = await this.tasks.find();
    const scoped = taskRows.filter(
      (t) =>
        t.departmentId === deptId ||
        (t.assigneeId != null && memberIds.includes(t.assigneeId)),
    );
    const open = scoped.filter((t) => t.status !== TaskStatus.DONE);
    taskActive = open.length;
    const withDue = scoped.filter(
      (t) => t.status === TaskStatus.DONE && t.dueDate,
    );
    if (withDue.length > 0) {
      const onTime = withDue.filter((t) => {
        const due = t.dueDate!;
        const done = t.updatedAt
          ? t.updatedAt.toISOString().slice(0, 10)
          : due;
        return done <= due;
      }).length;
      taskOnTimePct = Math.round((onTime / withDue.length) * 1000) / 10;
    }

    let attendancePct: number | null = null;
    let attendanceDelta: number | null = null;
    if (memberIds.length > 0) {
      const records = await this.attendance.find();
      const thisMonth = records.filter(
        (r) =>
          memberIds.includes(r.employeeId) &&
          r.workDate >= monthStart &&
          r.workDate <= monthEnd &&
          r.checkInTime != null,
      );
      const onTime = thisMonth.filter((r) => {
        const t = new Date(r.checkInTime!);
        return t.getHours() < 9 || (t.getHours() === 9 && t.getMinutes() === 0);
      }).length;
      if (thisMonth.length > 0) {
        attendancePct =
          Math.round((onTime / thisMonth.length) * 1000) / 10;
      }

      const prev = new Date(y, m - 1, 1);
      const py = prev.getFullYear();
      const pm = prev.getMonth();
      const pStart = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
      const pLast = new Date(py, pm + 1, 0).getDate();
      const pEnd = `${py}-${String(pm + 1).padStart(2, '0')}-${String(pLast).padStart(2, '0')}`;
      const prevMonth = records.filter(
        (r) =>
          memberIds.includes(r.employeeId) &&
          r.workDate >= pStart &&
          r.workDate <= pEnd &&
          r.checkInTime != null,
      );
      if (prevMonth.length > 0 && attendancePct != null) {
        const prevOn = prevMonth.filter((r) => {
          const t = new Date(r.checkInTime!);
          return (
            t.getHours() < 9 || (t.getHours() === 9 && t.getMinutes() === 0)
          );
        }).length;
        const prevPct =
          Math.round((prevOn / prevMonth.length) * 1000) / 10;
        attendanceDelta = Math.round((attendancePct - prevPct) * 10) / 10;
      }
    }

    return {
      label,
      taskActive,
      taskOnTimePct,
      attendancePct,
      attendanceDelta,
    };
  }

  async findOne(id: number) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Department not found');
    const [row] = await this.enrich([d]);
    const allMembers = await this.employees.find({
      where: { departmentId: id },
      order: { id: 'ASC' },
    });
    const members = allMembers.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      position: e.position,
      email: e.email,
      status: e.status,
      hireDate: e.hireDate,
    }));
    const activeIds = allMembers
      .filter((e) => e.status === EmployeeStatus.ACTIVE)
      .map((e) => e.id);
    const metrics = await this.deptMetrics(id, activeIds);
    const slotsLeft =
      row.headcountTarget != null
        ? Math.max(0, row.headcountTarget - row.headcount)
        : null;
    return { ...row, members, metrics, slotsLeft };
  }

  async audit(id: number, limit = 40) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Department not found');
    const logs = await this.logs.findForEntity('Department', id, limit);
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

  async create(dto: CreateDepartmentDto, actorId?: number) {
    const code = this.normalizeCode(dto.departmentCode);
    if (!this.validateCodeFormat(code)) {
      throw new BadRequestException(
        'Invalid department code (expect PB-XXXX)',
      );
    }
    const exists = await this.repo.findOne({
      where: { departmentCode: code },
    });
    if (exists) throw new BadRequestException('Department code exists');

    await this.assertEmployee(dto.managerEmployeeId, 'Manager employee');
    await this.assertEmployee(dto.deputyEmployeeId, 'Deputy employee');
    await this.assertParent(dto.parentDepartmentId);

    if (
      dto.managerEmployeeId != null &&
      dto.deputyEmployeeId != null &&
      dto.managerEmployeeId === dto.deputyEmployeeId
    ) {
      throw new BadRequestException('Deputy cannot be same as manager');
    }

    const status = dto.status ?? DepartmentStatus.ACTIVE;
    const saved = await this.repo.save(
      this.repo.create({
        departmentCode: code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        managerEmployeeId: dto.managerEmployeeId ?? null,
        deputyEmployeeId: dto.deputyEmployeeId ?? null,
        parentDepartmentId: dto.parentDepartmentId ?? null,
        headcountTarget: dto.headcountTarget ?? null,
        foundedAt: dto.foundedAt || null,
        location: dto.location?.trim() || null,
        contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
        category: dto.category?.trim() || null,
        recruitmentPaused: false,
        status,
      }),
    );
    await this.logs.log({
      actorUserId: actorId,
      action: 'DEPARTMENT_CREATE',
      entityType: 'Department',
      entityId: saved.id,
      metadata: { departmentCode: saved.departmentCode, status: saved.status },
    });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateDepartmentDto, actorId?: number) {
    const dept = await this.repo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    const prev = {
      name: dept.name,
      status: dept.status,
      managerEmployeeId: dept.managerEmployeeId,
      deputyEmployeeId: dept.deputyEmployeeId,
      headcountTarget: dept.headcountTarget,
      recruitmentPaused: dept.recruitmentPaused,
      contactEmail: dept.contactEmail,
      location: dept.location,
      parentDepartmentId: dept.parentDepartmentId,
    };

    if (dto.name !== undefined) dept.name = dto.name.trim();
    if (dto.description !== undefined) dept.description = dto.description;
    if (dto.managerEmployeeId !== undefined) {
      await this.assertEmployee(dto.managerEmployeeId, 'Manager employee');
      dept.managerEmployeeId = dto.managerEmployeeId;
    }
    if (dto.deputyEmployeeId !== undefined) {
      await this.assertEmployee(dto.deputyEmployeeId, 'Deputy employee');
      dept.deputyEmployeeId = dto.deputyEmployeeId;
    }
    if (dto.parentDepartmentId !== undefined) {
      await this.assertParent(dto.parentDepartmentId, id);
      dept.parentDepartmentId = dto.parentDepartmentId;
    }
    if (dto.headcountTarget !== undefined)
      dept.headcountTarget = dto.headcountTarget;
    if (dto.foundedAt !== undefined) dept.foundedAt = dto.foundedAt;
    if (dto.location !== undefined) dept.location = dto.location;
    if (dto.contactEmail !== undefined)
      dept.contactEmail = dto.contactEmail
        ? dto.contactEmail.trim().toLowerCase()
        : null;
    if (dto.category !== undefined) dept.category = dto.category;
    if (dto.recruitmentPaused !== undefined)
      dept.recruitmentPaused = dto.recruitmentPaused;
    if (dto.status !== undefined) dept.status = dto.status;

    const mgr = dept.managerEmployeeId;
    const dep = dept.deputyEmployeeId;
    if (mgr != null && dep != null && mgr === dep) {
      throw new BadRequestException('Deputy cannot be same as manager');
    }

    const saved = await this.repo.save(dept);

    let action = 'DEPARTMENT_UPDATE';
    if (dto.status !== undefined && dto.status !== prev.status) {
      action = 'DEPARTMENT_STATUS_CHANGE';
    } else if (
      dto.managerEmployeeId !== undefined &&
      dto.managerEmployeeId !== prev.managerEmployeeId
    ) {
      action = 'DEPARTMENT_MANAGER_CHANGE';
    } else if (
      dto.headcountTarget !== undefined &&
      dto.headcountTarget !== prev.headcountTarget
    ) {
      action = 'DEPARTMENT_QUOTA_CHANGE';
    } else if (
      dto.recruitmentPaused !== undefined &&
      dto.recruitmentPaused !== prev.recruitmentPaused
    ) {
      action = 'DEPARTMENT_RECRUITMENT_TOGGLE';
    }

    await this.logs.log({
      actorUserId: actorId,
      action,
      entityType: 'Department',
      entityId: saved.id,
      metadata: {
        updateReason: dto.updateReason || null,
        prev,
        next: {
          name: saved.name,
          status: saved.status,
          managerEmployeeId: saved.managerEmployeeId,
          deputyEmployeeId: saved.deputyEmployeeId,
          headcountTarget: saved.headcountTarget,
          recruitmentPaused: saved.recruitmentPaused,
          contactEmail: saved.contactEmail,
          location: saved.location,
          parentDepartmentId: saved.parentDepartmentId,
        },
      },
    });
    return this.findOne(saved.id);
  }
}
