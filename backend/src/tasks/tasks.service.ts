import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStatus, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Task } from './task.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly repo: Repository<Task>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly logs: SystemLogsService,
  ) {}

  private async scopeEmployeeIds(user: AuthUser): Promise<number[] | null> {
    if (user.role === UserRole.ADMIN) return null;
    if (user.role === UserRole.EMPLOYEE) {
      return user.employeeId ? [user.employeeId] : [];
    }
    const ids = new Set<number>();
    if (user.employeeId) ids.add(user.employeeId);
    const depts = await this.deptRepo.find({
      where: { managerEmployeeId: user.employeeId ?? undefined },
    });
    for (const d of depts) {
      const emps = await this.empRepo.find({ where: { departmentId: d.id } });
      emps.forEach((e) => ids.add(e.id));
    }
    return [...ids];
  }

  async findAll(user: AuthUser) {
    const scope = await this.scopeEmployeeIds(user);
    const all = await this.repo.find({ order: { id: 'DESC' } });
    if (scope === null) return all;
    return all.filter(
      (t) =>
        (t.assigneeId != null && scope.includes(t.assigneeId)) ||
        t.createdBy === user.id,
    );
  }

  async create(data: Partial<Task>, user: AuthUser) {
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();
    const task = await this.repo.save(
      this.repo.create({
        ...data,
        createdBy: user.id,
        status: TaskStatus.TODO,
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'TASK_CREATE',
      entityType: 'Task',
      entityId: task.id,
    });
    return task;
  }

  async update(id: number, data: Partial<Task>, user: AuthUser) {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (user.role === UserRole.EMPLOYEE) {
      if (task.assigneeId !== user.employeeId) throw new ForbiddenException();
      if (data.status) task.status = data.status;
      if (data.description !== undefined) task.description = data.description;
    } else {
      Object.assign(task, data);
    }
    const saved = await this.repo.save(task);
    await this.logs.log({
      actorUserId: user.id,
      action: 'TASK_UPDATE',
      entityType: 'Task',
      entityId: saved.id,
      metadata: { status: saved.status },
    });
    return saved;
  }
}
