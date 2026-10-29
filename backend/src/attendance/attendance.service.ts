import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AttendanceStatus, EmployeeStatus, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AttendanceRecord } from './attendance.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

const SHIFT_START = { h: 8, m: 30 };
const SHIFT_END = { h: 17, m: 30 };

@Injectable()
export class AttendanceService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'attendance');

  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly repo: Repository<AttendanceRecord>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly logs: SystemLogsService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private savePhoto(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo is required');
    }
    const key = `${uuidv4()}.jpg`;
    writeFileSync(join(this.uploadDir, key), file.buffer);
    return key;
  }

  private async assertScope(user: AuthUser, employeeId: number) {
    if (user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.EMPLOYEE) {
      if (employeeId !== user.employeeId) throw new ForbiddenException();
      return;
    }
    const depts = await this.deptRepo.find({
      where: { managerEmployeeId: user.employeeId ?? undefined },
    });
    const deptIds = depts.map((d) => d.id);
    const emp = await this.empRepo.findOne({ where: { id: employeeId } });
    if (
      !emp ||
      (emp.id !== user.employeeId &&
        (emp.departmentId == null || !deptIds.includes(emp.departmentId)))
    ) {
      throw new ForbiddenException();
    }
  }

  private async scopedActiveHeadcount(user: AuthUser): Promise<number> {
    const emps = await this.empRepo.find();
    const active = (e: Employee) => e.status === EmployeeStatus.ACTIVE;
    if (user.role === UserRole.EMPLOYEE) {
      if (!user.employeeId) return 0;
      const self = emps.find((e) => e.id === user.employeeId);
      return self && active(self) ? 1 : 0;
    }
    if (user.role === UserRole.MANAGER) {
      const depts = await this.deptRepo.find({
        where: { managerEmployeeId: user.employeeId ?? undefined },
      });
      const deptIds = depts.map((d) => d.id);
      return emps.filter(
        (e) =>
          active(e) &&
          (e.id === user.employeeId ||
            (e.departmentId != null && deptIds.includes(e.departmentId))),
      ).length;
    }
    return emps.filter(active).length;
  }

  private async scopedList(user: AuthUser) {
    let list = await this.repo.find({ order: { workDate: 'DESC', id: 'DESC' } });
    if (user.role === UserRole.EMPLOYEE) {
      list = list.filter((r) => r.employeeId === user.employeeId);
    } else if (user.role === UserRole.MANAGER) {
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
      list = list.filter((r) => allowed.has(r.employeeId));
    }
    return list;
  }

  private minutesFromMidnight(d: Date) {
    return d.getHours() * 60 + d.getMinutes();
  }

  private enrichOne(
    r: AttendanceRecord,
    empMap: Map<number, Employee>,
    deptMap: Map<number, Department>,
  ) {
    const emp = empMap.get(r.employeeId);
    const dept =
      emp?.departmentId != null ? deptMap.get(emp.departmentId) : undefined;
    const shiftStartMin = SHIFT_START.h * 60 + SHIFT_START.m;
    let lateMinutes: number | null = null;
    let earlyMinutes: number | null = null;
    let punctuality: 'ON_TIME' | 'LATE' | 'EARLY' | 'NONE' = 'NONE';
    if (r.checkInTime) {
      const t = new Date(r.checkInTime);
      const mins = this.minutesFromMidnight(t);
      const diff = mins - shiftStartMin;
      if (diff > 0) {
        lateMinutes = diff;
        punctuality = 'LATE';
      } else if (diff < 0) {
        earlyMinutes = Math.abs(diff);
        punctuality = 'EARLY';
      } else {
        punctuality = 'ON_TIME';
      }
    }
    let workMinutes: number | null = null;
    if (r.checkInTime && r.checkOutTime) {
      workMinutes = Math.max(
        0,
        Math.round(
          (new Date(r.checkOutTime).getTime() -
            new Date(r.checkInTime).getTime()) /
            60000,
        ),
      );
    }
    const workUnits =
      workMinutes != null
        ? Math.round((Math.min(workMinutes, 8 * 60) / (8 * 60)) * 100) / 100
        : r.status === AttendanceStatus.IN_PROGRESS
          ? null
          : 0;
    const code =
      r.recordCode ||
      `ATT-${r.workDate.replace(/-/g, '')}-${String(r.id).padStart(3, '0')}`;
    return {
      id: r.id,
      recordCode: code,
      employeeId: r.employeeId,
      employee: emp
        ? {
            id: emp.id,
            fullName: emp.fullName,
            employeeCode: emp.employeeCode,
            position: emp.position,
          }
        : null,
      department: dept
        ? { id: dept.id, name: dept.name, departmentCode: dept.departmentCode }
        : null,
      workDate: r.workDate,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      checkInPhotoKey: r.checkInPhotoKey,
      checkOutPhotoKey: r.checkOutPhotoKey,
      status: r.status,
      flagged: !!r.flagged,
      shiftLabel: 'Ca Hành chính',
      shiftStart: '08:30',
      shiftEnd: '17:30',
      lateMinutes,
      earlyMinutes,
      punctuality,
      workMinutes,
      workUnits,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private async enrich(records: AttendanceRecord[]) {
    const emps = await this.empRepo.find();
    const depts = await this.deptRepo.find();
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    return records.map((r) => this.enrichOne(r, empMap, deptMap));
  }

  async stats(user: AuthUser, date?: string) {
    const list = await this.scopedList(user);
    const rows = await this.enrich(list);
    const day = date || this.today();
    const dayRows = rows.filter((r) => r.workDate === day);
    const withIn = dayRows.filter((r) => r.checkInTime);
    const onTime = withIn.filter(
      (r) => r.punctuality === 'ON_TIME' || r.punctuality === 'EARLY',
    ).length;
    const late = withIn.filter((r) => r.punctuality === 'LATE').length;
    const onTimeRate =
      withIn.length > 0
        ? Math.round((onTime / withIn.length) * 1000) / 10
        : null;
    const flaggedToday = dayRows.filter((r) => r.flagged).length;
    const flagged = rows.filter((r) => r.flagged).length;
    const present = withIn.length;
    let headcount = await this.scopedActiveHeadcount(user);
    if (headcount === 0) {
      headcount = new Set(dayRows.map((r) => r.employeeId)).size;
    }
    const presentRate =
      headcount > 0
        ? Math.round((present / headcount) * 1000) / 10
        : null;
    const inProgress = dayRows.filter(
      (r) => r.status === AttendanceStatus.IN_PROGRESS,
    ).length;
    const completed = dayRows.filter(
      (r) => r.status === AttendanceStatus.COMPLETED,
    ).length;
    const anomalies = dayRows.filter(
      (r) => r.punctuality === 'LATE' || r.flagged,
    ).length;
    return {
      date: day,
      total: dayRows.length,
      headcount,
      present,
      presentRate,
      onTime,
      late,
      onTimeRate,
      inProgress,
      completed,
      anomalies,
      needReview: anomalies,
      flagged,
      flaggedToday,
      allTimeTotal: rows.length,
    };
  }

  async findAll(
    user: AuthUser,
    query: {
      q?: string;
      date?: string;
      punctuality?: string;
      status?: string;
      departmentId?: number;
      employeeId?: number;
      flagged?: string;
      anomalies?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    let list = await this.scopedList(user);
    if (query.employeeId) {
      list = list.filter((r) => r.employeeId === query.employeeId);
    }
    let rows = await this.enrich(list);
    if (query.date) rows = rows.filter((r) => r.workDate === query.date);
    if (query.departmentId) {
      rows = rows.filter((r) => r.department?.id === query.departmentId);
    }
    if (query.punctuality === 'ON_TIME') {
      rows = rows.filter(
        (r) => r.punctuality === 'ON_TIME' || r.punctuality === 'EARLY',
      );
    } else if (query.punctuality === 'LATE') {
      rows = rows.filter((r) => r.punctuality === 'LATE');
    } else if (query.punctuality === 'IN_PROGRESS') {
      rows = rows.filter((r) => r.status === AttendanceStatus.IN_PROGRESS);
    }
    if (query.status === AttendanceStatus.COMPLETED) {
      rows = rows.filter((r) => r.status === AttendanceStatus.COMPLETED);
    } else if (query.status === AttendanceStatus.IN_PROGRESS) {
      rows = rows.filter((r) => r.status === AttendanceStatus.IN_PROGRESS);
    }
    if (query.anomalies === '1' || query.anomalies === 'true') {
      rows = rows.filter((r) => r.punctuality === 'LATE' || r.flagged);
    }
    if (query.flagged === '1' || query.flagged === 'true') {
      rows = rows.filter((r) => r.flagged);
    }
    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.recordCode,
          r.employee?.fullName,
          r.employee?.employeeCode,
          r.department?.name,
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
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize, totalPages };
  }

  async findOne(id: number, user: AuthUser) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Attendance not found');
    await this.assertScope(user, r.employeeId);
    const [row] = await this.enrich([r]);
    const recent = await this.repo.find({
      where: { employeeId: r.employeeId },
      order: { workDate: 'DESC' },
      take: 6,
    });
    const recentRows = (await this.enrich(recent)).filter((x) => x.id !== id);
    return { ...row, recentHistory: recentRows.slice(0, 5) };
  }

  async setFlagged(id: number, flagged: boolean, user: AuthUser) {
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Attendance not found');
    await this.assertScope(user, r.employeeId);
    r.flagged = flagged;
    await this.repo.save(r);
    await this.logs.log({
      actorUserId: user.id,
      action: flagged ? 'ATTENDANCE_FLAG' : 'ATTENDANCE_UNFLAG',
      entityType: 'Attendance',
      entityId: id,
    });
    return this.findOne(id, user);
  }

  async checkIn(user: AuthUser, file: Express.Multer.File) {
    if (!user.employeeId) {
      throw new BadRequestException('No employee profile linked');
    }
    const workDate = this.today();
    const existing = await this.repo.findOne({
      where: { employeeId: user.employeeId, workDate },
    });
    if (existing) {
      throw new BadRequestException('Already checked in today');
    }
    const photoKey = this.savePhoto(file);
    const count = await this.repo.count({ where: { workDate } });
    const recordCode = `ATT-${workDate.replace(/-/g, '')}-${String(count + 1).padStart(3, '0')}`;
    const record = await this.repo.save(
      this.repo.create({
        employeeId: user.employeeId,
        workDate,
        checkInTime: new Date(),
        checkInPhotoKey: photoKey,
        status: AttendanceStatus.IN_PROGRESS,
        recordCode,
        flagged: false,
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'ATTENDANCE_CHECK_IN',
      entityType: 'Attendance',
      entityId: record.id,
    });
    return this.findOne(record.id, user);
  }

  async checkOut(user: AuthUser, file: Express.Multer.File) {
    if (!user.employeeId) {
      throw new BadRequestException('No employee profile linked');
    }
    const workDate = this.today();
    const record = await this.repo.findOne({
      where: { employeeId: user.employeeId, workDate },
    });
    if (!record || !record.checkInTime) {
      throw new BadRequestException('Must check in first');
    }
    if (record.status === AttendanceStatus.COMPLETED) {
      throw new BadRequestException('Already checked out');
    }
    const photoKey = this.savePhoto(file);
    record.checkOutTime = new Date();
    record.checkOutPhotoKey = photoKey;
    record.status = AttendanceStatus.COMPLETED;
    const saved = await this.repo.save(record);
    await this.logs.log({
      actorUserId: user.id,
      action: 'ATTENDANCE_CHECK_OUT',
      entityType: 'Attendance',
      entityId: saved.id,
    });
    return this.findOne(saved.id, user);
  }

  async getPhotoStream(key: string, user: AuthUser) {
    const path = join(this.uploadDir, key);
    if (
      !existsSync(path) ||
      key.includes('..') ||
      key.includes('/') ||
      key.includes('\\')
    ) {
      throw new NotFoundException('Photo not found');
    }
    const record = await this.repo.findOne({
      where: [{ checkInPhotoKey: key }, { checkOutPhotoKey: key }],
    });
    if (!record) throw new NotFoundException('Photo not found');
    await this.assertScope(user, record.employeeId);
    return createReadStream(path);
  }

  async todayStatus(user: AuthUser) {
    if (!user.employeeId) return null;
    const r = await this.repo.findOne({
      where: { employeeId: user.employeeId, workDate: this.today() },
    });
    if (!r) return null;
    const [row] = await this.enrich([r]);
    return row;
  }
}
