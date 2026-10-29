import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Employee } from './employee.entity';

type AuthUser = {
  id: number;
  role: UserRole;
  employeeId: number | null;
};

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly logs: SystemLogsService,
  ) {}

  private async managedDepartmentIds(user: AuthUser): Promise<number[]> {
    if (!user.employeeId) return [];
    const depts = await this.deptRepo.find({
      where: { managerEmployeeId: user.employeeId },
    });
    return depts.map((d) => d.id);
  }

  async findAll(user: AuthUser, q?: string) {
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
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(lower) ||
          e.employeeCode.toLowerCase().includes(lower),
      );
    }
    return list;
  }

  async findOne(id: number, user: AuthUser) {
    const emp = await this.repo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
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
    return emp;
  }

  async create(data: Partial<Employee>, actorId?: number) {
    const exists = await this.repo.findOne({
      where: { employeeCode: data.employeeCode },
    });
    if (exists) throw new BadRequestException('Employee code exists');
    const saved = await this.repo.save(this.repo.create(data));
    await this.logs.log({
      actorUserId: actorId,
      action: 'EMPLOYEE_CREATE',
      entityType: 'Employee',
      entityId: saved.id,
    });
    return saved;
  }

  async update(id: number, data: Partial<Employee>, user: AuthUser) {
    const emp = await this.findOne(id, user);
    if (user.role === UserRole.EMPLOYEE) {
      emp.phone = data.phone ?? emp.phone;
      emp.email = data.email ?? emp.email;
    } else {
      Object.assign(emp, data);
    }
    const saved = await this.repo.save(emp);
    await this.logs.log({
      actorUserId: user.id,
      action: 'EMPLOYEE_UPDATE',
      entityType: 'Employee',
      entityId: saved.id,
    });
    return saved;
  }
}
