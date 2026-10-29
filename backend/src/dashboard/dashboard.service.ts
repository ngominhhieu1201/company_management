import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  TaskStatus,
  UserRole,
} from '../common/enums';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { Task } from '../tasks/task.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(AttendanceRecord)
    private readonly attRepo: Repository<AttendanceRecord>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
  ) {}

  async getStats(user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      const employees = await this.empRepo.count({
        where: { status: EmployeeStatus.ACTIVE },
      });
      const departments = await this.deptRepo.count();
      const tasks = await this.taskRepo.find();
      const byStatus = this.countBy(tasks, 'status');
      const attendanceToday = await this.attRepo.count({
        where: { workDate: new Date().toISOString().slice(0, 10) },
      });
      const pendingLeave = await this.leaveRepo.count({
        where: { status: LeaveStatus.PENDING },
      });
      return {
        role: user.role,
        employees,
        departments,
        tasksByStatus: byStatus,
        attendanceToday,
        pendingLeave,
      };
    }

    if (user.role === UserRole.MANAGER) {
      const depts = await this.deptRepo.find({
        where: { managerEmployeeId: user.employeeId ?? undefined },
      });
      const deptIds = depts.map((d) => d.id);
      const emps = await this.empRepo.find();
      const scoped = emps.filter(
        (e) =>
          e.id === user.employeeId ||
          (e.departmentId != null && deptIds.includes(e.departmentId)),
      );
      const scopedIds = new Set(scoped.map((e) => e.id));
      const tasks = (await this.taskRepo.find()).filter(
        (t) => t.assigneeId != null && scopedIds.has(t.assigneeId),
      );
      const pendingLeave = (await this.leaveRepo.find()).filter(
        (l) => scopedIds.has(l.employeeId) && l.status === LeaveStatus.PENDING,
      ).length;
      return {
        role: user.role,
        employees: scoped.length,
        tasksByStatus: this.countBy(tasks, 'status'),
        dueSoon: tasks.filter(
          (t) =>
            t.dueDate &&
            t.status !== TaskStatus.DONE &&
            t.dueDate <=
              new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        ).length,
        pendingLeave,
      };
    }

    const myTasks = (await this.taskRepo.find()).filter(
      (t) => t.assigneeId === user.employeeId,
    );
    const todayAtt = user.employeeId
      ? await this.attRepo.findOne({
          where: {
            employeeId: user.employeeId,
            workDate: new Date().toISOString().slice(0, 10),
          },
        })
      : null;
    const myLeave = (await this.leaveRepo.find()).filter(
      (l) => l.employeeId === user.employeeId,
    );
    return {
      role: user.role,
      tasksByStatus: this.countBy(myTasks, 'status'),
      dueSoon: myTasks.filter(
        (t) =>
          t.dueDate &&
          t.status !== TaskStatus.DONE &&
          t.dueDate <=
            new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      ).length,
      attendanceToday: todayAtt
        ? {
            status: todayAtt.status,
            checkInTime: todayAtt.checkInTime,
            checkOutTime: todayAtt.checkOutTime,
          }
        : { status: AttendanceStatus.IN_PROGRESS, checkedIn: false },
      leavePending: myLeave.filter((l) => l.status === LeaveStatus.PENDING)
        .length,
    };
  }

  private countBy<T extends Record<string, any>>(items: T[], key: keyof T) {
    return items.reduce(
      (acc, item) => {
        const k = String(item[key]);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
