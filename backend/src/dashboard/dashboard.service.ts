import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  TaskStatus,
  UserRole,
} from '../common/enums';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { Task } from '../tasks/task.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

const LATE_AFTER_MINUTES = 8 * 60 + 30; // 08:30

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  [LeaveType.ANNUAL]: 'Nghỉ phép năm',
  [LeaveType.SICK]: 'Nghỉ ốm',
  [LeaveType.UNPAID]: 'Nghỉ không lương',
  [LeaveType.OTHER]: 'Khác',
};

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
      return this.adminOverview();
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

  private async adminOverview() {
    const today = new Date().toISOString().slice(0, 10);
    const employees = await this.empRepo.find({
      where: { status: EmployeeStatus.ACTIVE },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const totalStaff = employees.length;

    const attendanceRows = await this.attRepo.find({
      where: { workDate: today },
    });
    let onTime = 0;
    let late = 0;
    let checkInSum = 0;
    let checkInCount = 0;
    for (const row of attendanceRows) {
      if (!row.checkInTime) continue;
      const d = new Date(row.checkInTime);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins > LATE_AFTER_MINUTES) late += 1;
      else onTime += 1;
      checkInSum += mins;
      checkInCount += 1;
    }
    const checkedIn = onTime + late;
    const notCheckedIn = Math.max(0, totalStaff - checkedIn);
    const avgMins =
      checkInCount > 0 ? Math.round(checkInSum / checkInCount) : null;
    const avgCheckIn =
      avgMins != null
        ? `${String(Math.floor(avgMins / 60)).padStart(2, '0')}:${String(avgMins % 60).padStart(2, '0')}`
        : null;

    const tasks = await this.taskRepo.find({ order: { updatedAt: 'DESC' } });
    const openTasks = tasks.filter((t) => t.status !== TaskStatus.DONE);
    const dueSoon = openTasks.filter(
      (t) =>
        t.dueDate &&
        t.dueDate <=
          new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    ).length;

    const pendingLeaves = await this.leaveRepo.find({
      where: { status: LeaveStatus.PENDING },
      order: { createdAt: 'DESC' },
      take: 8,
    });

    const workingPct =
      totalStaff > 0 ? Math.round((checkedIn / totalStaff) * 1000) / 10 : 0;

    return {
      role: UserRole.ADMIN,
      employees: totalStaff,
      departments: await this.deptRepo.count(),
      workingToday: checkedIn,
      workingPct,
      openTasks: openTasks.length,
      dueSoon,
      pendingLeave: pendingLeaves.length,
      attendanceToday: checkedIn,
      tasksByStatus: this.countBy(tasks, 'status'),
      attendance: {
        checkedIn,
        onTime,
        late,
        notCheckedIn,
        onTimePct: checkedIn ? Math.round((onTime / checkedIn) * 1000) / 10 : 0,
        latePct: checkedIn ? Math.round((late / checkedIn) * 1000) / 10 : 0,
        notCheckedInPct:
          totalStaff > 0
            ? Math.round((notCheckedIn / totalStaff) * 1000) / 10
            : 0,
        avgCheckIn,
      },
      pendingLeaveRequests: pendingLeaves.map((l) => {
        const emp = empMap.get(l.employeeId);
        return {
          id: l.id,
          employeeId: l.employeeId,
          employeeName: emp?.fullName ?? `NV #${l.employeeId}`,
          leaveType: l.leaveType,
          leaveTypeLabel:
            LEAVE_TYPE_LABEL[l.leaveType] ?? String(l.leaveType),
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason,
        };
      }),
      activeTasks: openTasks.slice(0, 8).map((t) => {
        const emp = t.assigneeId ? empMap.get(t.assigneeId) : null;
        return {
          id: t.id,
          title: t.title,
          assigneeId: t.assigneeId,
          assigneeName: emp?.fullName ?? 'Chưa giao',
          dueDate: t.dueDate,
          status: t.status,
          priority: t.priority,
          progress: this.progressFromStatus(t.status),
        };
      }),
    };
  }

  private progressFromStatus(status: TaskStatus): number {
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
