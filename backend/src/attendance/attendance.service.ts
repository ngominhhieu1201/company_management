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
import { AttendanceStatus, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AttendanceRecord } from './attendance.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

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
    const record = await this.repo.save(
      this.repo.create({
        employeeId: user.employeeId,
        workDate,
        checkInTime: new Date(),
        checkInPhotoKey: photoKey,
        status: AttendanceStatus.IN_PROGRESS,
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'ATTENDANCE_CHECK_IN',
      entityType: 'Attendance',
      entityId: record.id,
    });
    return record;
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
    return saved;
  }

  async findAll(user: AuthUser, employeeId?: number) {
    let list = await this.repo.find({ order: { workDate: 'DESC' } });
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
    if (employeeId) {
      list = list.filter((r) => r.employeeId === employeeId);
    }
    return list;
  }

  async getPhotoStream(key: string, user: AuthUser) {
    const path = join(this.uploadDir, key);
    if (!existsSync(path) || key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new NotFoundException('Photo not found');
    }
    const record = await this.repo.findOne({
      where: [{ checkInPhotoKey: key }, { checkOutPhotoKey: key }],
    });
    if (!record) throw new NotFoundException('Photo not found');
    if (user.role === UserRole.EMPLOYEE && record.employeeId !== user.employeeId) {
      throw new ForbiddenException();
    }
    return createReadStream(path);
  }

  async todayStatus(user: AuthUser) {
    if (!user.employeeId) return null;
    return this.repo.findOne({
      where: { employeeId: user.employeeId, workDate: this.today() },
    });
  }
}
