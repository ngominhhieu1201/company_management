import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { LeaveStatus, LeaveType, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { User } from '../users/user.entity';
import { LeaveRequest } from './leave-request.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

export type LeaveAttachmentMeta = {
  key: string;
  originalName: string;
  size: number;
  mime: string;
};

const ANNUAL_QUOTA = 12;

function workDaysBetween(start: string, end: string) {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  if (b < a) return 0;
  let days = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class LeaveService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'leave');

  constructor(
    @InjectRepository(LeaveRequest)
    private readonly repo: Repository<LeaveRequest>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly logs: SystemLogsService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  saveUploadedFile(file: Express.Multer.File): LeaveAttachmentMeta {
    if (!file?.buffer?.length) throw new BadRequestException('Empty file');
    const max = 10 * 1024 * 1024;
    if (file.size > max) throw new BadRequestException('File quá lớn (tối đa 10MB)');
    const allowed = [
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.txt',
      '.zip',
    ];
    const ext = extname(file.originalname || '').toLowerCase();
    if (ext && !allowed.includes(ext)) {
      throw new BadRequestException('Định dạng tệp không được hỗ trợ');
    }
    const key = `${randomUUID()}${ext || ''}`;
    writeFileSync(join(this.uploadDir, key), file.buffer);
    return {
      key,
      originalName: file.originalname || key,
      size: file.size,
      mime: file.mimetype || 'application/octet-stream',
    };
  }

  getAttachmentStream(key: string) {
    const safe = key.replace(/[/\\]/g, '');
    const path = join(this.uploadDir, safe);
    if (!existsSync(path)) throw new NotFoundException('File not found');
    return { stream: createReadStream(path), key: safe };
  }

  private async scoped(user: AuthUser) {
    let list = await this.repo.find({ order: { id: 'DESC' } });
    if (user.role === UserRole.EMPLOYEE) {
      return list.filter((r) => r.employeeId === user.employeeId);
    }
    if (user.role === UserRole.MANAGER) {
      const depts = await this.deptRepo.find({
        where: { managerEmployeeId: user.employeeId ?? undefined },
      });
      const deptIds = depts.map((d) => d.id);
      const emps = await this.empRepo.find();
      const allowed = new Set(
        emps
          .filter(
            (e) =>
              e.id === user.employeeId ||
              (e.departmentId != null && deptIds.includes(e.departmentId)),
          )
          .map((e) => e.id),
      );
      return list.filter((r) => allowed.has(r.employeeId));
    }
    return list;
  }

  private async annualUsed(employeeId: number, year: number, excludeId?: number) {
    const all = await this.repo.find({ where: { employeeId } });
    return all
      .filter(
        (r) =>
          r.id !== excludeId &&
          r.leaveType === LeaveType.ANNUAL &&
          r.status === LeaveStatus.APPROVED &&
          r.startDate.startsWith(String(year)),
      )
      .reduce((s, r) => s + (r.daysCount ?? workDaysBetween(r.startDate, r.endDate)), 0);
  }

  private async enrich(rows: LeaveRequest[]) {
    const emps = await this.empRepo.find();
    const depts = await this.deptRepo.find();
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const reviewIds = [
      ...new Set(
        rows.map((r) => r.reviewBy).filter((x): x is number => x != null),
      ),
    ];
    const reviewers =
      reviewIds.length > 0
        ? await this.users.find({ where: { id: In(reviewIds) } })
        : [];
    const reviewerMap = new Map(reviewers.map((u) => [u.id, u.username]));
    const year = new Date().getFullYear();
    const result = [];
    for (const r of rows) {
      const emp = empMap.get(r.employeeId);
      const dept =
        emp?.departmentId != null ? deptMap.get(emp.departmentId) : undefined;
      const handover =
        r.handoverEmployeeId != null
          ? empMap.get(r.handoverEmployeeId)
          : undefined;
      const days = r.daysCount ?? workDaysBetween(r.startDate, r.endDate);
      const used = await this.annualUsed(r.employeeId, year, r.id);
      const remaining = Math.max(0, ANNUAL_QUOTA - used);
      const remainingAfter =
        r.leaveType === LeaveType.ANNUAL && r.status === LeaveStatus.PENDING
          ? Math.max(0, remaining - days)
          : remaining;
      result.push({
        id: r.id,
        leaveCode: r.leaveCode || `OFF-${r.id}`,
        employeeId: r.employeeId,
        employee: emp
          ? {
              id: emp.id,
              fullName: emp.fullName,
              employeeCode: emp.employeeCode,
              position: emp.position,
              email: emp.email,
              hireDate: emp.hireDate,
            }
          : null,
        department: dept
          ? {
              id: dept.id,
              name: dept.name,
              departmentCode: dept.departmentCode,
            }
          : null,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
        daysCount: days,
        reason: r.reason,
        handoverEmployeeId: r.handoverEmployeeId,
        handover: handover
          ? {
              id: handover.id,
              fullName: handover.fullName,
              employeeCode: handover.employeeCode,
              position: handover.position,
            }
          : null,
        urgency: r.urgency || 'NORMAL',
        attachmentName: r.attachmentName,
        attachmentKey: r.attachmentKey,
        status: r.status,
        reviewBy: r.reviewBy,
        reviewedAt: r.reviewedAt,
        reviewerName: r.reviewBy
          ? (reviewerMap.get(r.reviewBy) ?? null)
          : null,
        reviewComment: r.reviewComment,
        quota: {
          year,
          annualQuota: ANNUAL_QUOTA,
          used,
          remaining,
          remainingAfter,
          thisRequest: days,
        },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }
    return result;
  }

  async stats(user: AuthUser) {
    const rows = await this.enrich(await this.scoped(user));
    const today = todayStr();
    const month = today.slice(0, 7);
    const pending = rows.filter((r) => r.status === LeaveStatus.PENDING);
    const approvedMonth = rows.filter(
      (r) =>
        r.status === LeaveStatus.APPROVED &&
        String(r.reviewedAt || r.createdAt).slice(0, 7) === month,
    );
    const rejected = rows.filter((r) => r.status === LeaveStatus.REJECTED);
    const onLeaveToday = rows.filter(
      (r) =>
        r.status === LeaveStatus.APPROVED &&
        r.startDate <= today &&
        r.endDate >= today,
    );
    const byType: Record<string, number> = {};
    for (const r of rows) {
      byType[r.leaveType] = (byType[r.leaveType] || 0) + 1;
    }
    const reviewed = rows.filter(
      (r) =>
        r.reviewedAt &&
        (r.status === LeaveStatus.APPROVED ||
          r.status === LeaveStatus.REJECTED),
    );
    let avgResponseHours: number | null = null;
    if (reviewed.length > 0) {
      const totalH = reviewed.reduce((sum, r) => {
        const created = new Date(r.createdAt).getTime();
        const rev = new Date(r.reviewedAt!).getTime();
        return sum + (rev - created) / 3_600_000;
      }, 0);
      avgResponseHours = Math.round((totalH / reviewed.length) * 10) / 10;
    }
    return {
      total: rows.length,
      pending: pending.length,
      pendingUrgent: pending.filter((r) => r.urgency === 'URGENT').length,
      approvedMonth: approvedMonth.length,
      rejected: rejected.length,
      rejectedPct:
        rows.length > 0
          ? Math.round((rejected.length / rows.length) * 1000) / 10
          : 0,
      onLeaveToday: onLeaveToday.length,
      avgResponseHours,
      byType,
      month,
      today,
    };
  }

  async findAll(
    user: AuthUser,
    query: {
      q?: string;
      status?: string;
      leaveType?: string;
      departmentId?: number;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    let rows = await this.enrich(await this.scoped(user));
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    if (query.leaveType)
      rows = rows.filter((r) => r.leaveType === query.leaveType);
    if (query.departmentId)
      rows = rows.filter((r) => r.department?.id === query.departmentId);
    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.leaveCode,
          r.employee?.fullName,
          r.employee?.employeeCode,
          r.reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findOne(id: number, user: AuthUser) {
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    const scoped = await this.scoped(user);
    if (!scoped.some((r) => r.id === id)) throw new ForbiddenException();
    const [row] = await this.enrich([req]);
    let reviewerName: string | null = null;
    if (req.reviewBy) {
      const u = await this.users.findOne({ where: { id: req.reviewBy } });
      reviewerName = u?.username || null;
    }
    const logs = await this.logs.findForEntity('LeaveRequest', id, 30);
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
    const map = new Map(actors.map((a) => [a.id, a.username]));
    const audit = logs.map((l) => ({
      id: l.id,
      action: l.action,
      createdAt: l.createdAt,
      actorUsername:
        l.actorUserId != null
          ? (map.get(l.actorUserId) ?? `user#${l.actorUserId}`)
          : 'SYSTEM',
    }));
    return { ...row, reviewerName, audit };
  }

  async nextCode() {
    const year = new Date().getFullYear();
    const prefix = `OFF-${year}-`;
    const all = await this.repo.find();
    let max = 0;
    for (const r of all) {
      if (!r.leaveCode?.startsWith(prefix)) continue;
      const n = Number(r.leaveCode.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return {
      leaveCode: `${prefix}${String(max + 1).padStart(4, '0')}`,
    };
  }

  async create(
    user: AuthUser,
    data: {
      leaveType: LeaveType;
      startDate: string;
      endDate: string;
      reason?: string;
      handoverEmployeeId?: number;
      urgency?: string;
      attachmentName?: string;
      attachmentKey?: string;
      employeeId?: number;
    },
  ) {
    let employeeId = user.employeeId;
    if (data.employeeId != null) {
      if (user.role === UserRole.EMPLOYEE && data.employeeId !== user.employeeId) {
        throw new ForbiddenException();
      }
      employeeId = data.employeeId;
    }
    if (!employeeId) throw new BadRequestException('No employee linked');
    if (data.startDate > data.endDate) {
      throw new BadRequestException('Invalid date range');
    }
    if (data.handoverEmployeeId != null) {
      const h = await this.empRepo.findOne({
        where: { id: data.handoverEmployeeId },
      });
      if (!h) throw new BadRequestException('Handover employee not found');
    }
    const days = workDaysBetween(data.startDate, data.endDate);
    if (days <= 0) throw new BadRequestException('No working days in range');
    if (data.leaveType === LeaveType.ANNUAL) {
      const used = await this.annualUsed(employeeId, new Date().getFullYear());
      if (used + days > ANNUAL_QUOTA) {
        throw new BadRequestException('Exceeds annual leave quota');
      }
    }
    const { leaveCode } = await this.nextCode();
    const saved = await this.repo.save(
      this.repo.create({
        employeeId,
        leaveCode,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        daysCount: days,
        reason: data.reason ?? null,
        handoverEmployeeId: data.handoverEmployeeId ?? null,
        urgency: data.urgency === 'URGENT' ? 'URGENT' : 'NORMAL',
        attachmentName: data.attachmentName?.trim() || null,
        attachmentKey: data.attachmentKey?.trim() || null,
        status: LeaveStatus.PENDING,
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'LEAVE_CREATE',
      entityType: 'LeaveRequest',
      entityId: saved.id,
      metadata: { leaveCode },
    });
    return this.findOne(saved.id, user);
  }

  async review(
    id: number,
    user: AuthUser,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Already processed');
    }
    req.status =
      decision === 'APPROVED' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
    req.reviewBy = user.id;
    req.reviewedAt = new Date();
    req.reviewComment = comment ?? null;
    const saved = await this.repo.save(req);
    await this.logs.log({
      actorUserId: user.id,
      action: `LEAVE_${decision}`,
      entityType: 'LeaveRequest',
      entityId: saved.id,
      metadata: { comment: comment || null },
    });
    return this.findOne(saved.id, user);
  }

  async cancel(id: number, user: AuthUser) {
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (user.role === UserRole.EMPLOYEE) {
      if (req.employeeId !== user.employeeId) throw new ForbiddenException();
    } else if (user.role === UserRole.MANAGER) {
      const scoped = await this.scoped(user);
      if (!scoped.some((r) => r.id === id)) throw new ForbiddenException();
    }
    if (req.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    req.status = LeaveStatus.CANCELLED;
    const saved = await this.repo.save(req);
    await this.logs.log({
      actorUserId: user.id,
      action: 'LEAVE_CANCELLED',
      entityType: 'LeaveRequest',
      entityId: saved.id,
      metadata: { leaveCode: saved.leaveCode },
    });
    return this.findOne(saved.id, user);
  }
}
