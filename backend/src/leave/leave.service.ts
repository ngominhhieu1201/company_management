import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveStatus, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { LeaveRequest } from './leave-request.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly repo: Repository<LeaveRequest>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly logs: SystemLogsService,
  ) {}

  async create(
    user: AuthUser,
    data: {
      leaveType: LeaveRequest['leaveType'];
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    if (!user.employeeId) throw new BadRequestException('No employee linked');
    if (data.startDate > data.endDate) {
      throw new BadRequestException('Invalid date range');
    }
    const saved = await this.repo.save(
      this.repo.create({
        employeeId: user.employeeId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason ?? null,
        status: LeaveStatus.PENDING,
      }),
    );
    return saved;
  }

  async findAll(user: AuthUser) {
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
    });
    return saved;
  }
}
