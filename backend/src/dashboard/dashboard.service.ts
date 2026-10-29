import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceStatus,
  EmployeeStatus,
  LeaveStatus,
  LeaveType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '../common/enums';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { Task } from '../tasks/task.entity';

function formatShortRange(start: string, end: string) {
  const fmt = (s: string) => {
    const [, m, d] = s.split('-');
    return `${d}/${m}`;
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

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
      return this.managerOverview(user);
    }

    return this.employeeOverview(user);
  }

  private async employeeOverview(user: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const year = today.slice(0, 4);
    const monthPrefix = today.slice(0, 7);
    const empId = user.employeeId;

    const emp = empId
      ? await this.empRepo.findOne({ where: { id: empId } })
      : null;
    const dept =
      emp?.departmentId != null
        ? await this.deptRepo.findOne({ where: { id: emp.departmentId } })
        : null;

    const myTasks = (await this.taskRepo.find()).filter(
      (t) => t.assigneeId === empId,
    );
    const openTasks = myTasks.filter((t) => t.status !== TaskStatus.DONE);
    const highPriority = openTasks.filter(
      (t) =>
        t.priority === TaskPriority.HIGH || t.priority === TaskPriority.URGENT,
    ).length;

    const priorityTasks = [...openTasks]
      .sort((a, b) => {
        const rank = (p: string) =>
          p === TaskPriority.URGENT
            ? 0
            : p === TaskPriority.HIGH
              ? 1
              : p === TaskPriority.MEDIUM
                ? 2
                : 3;
        const pr = rank(a.priority) - rank(b.priority);
        if (pr !== 0) return pr;
        return String(a.dueDate || '9999').localeCompare(
          String(b.dueDate || '9999'),
        );
      })
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        taskCode: t.taskCode || `TSK-${t.id}`,
        title: t.title,
        priority: t.priority,
        status: t.status,
        progress: t.progress ?? 0,
        dueDate: t.dueDate,
        startDate: t.startDate,
      }));

    const allAtt = empId
      ? await this.attRepo.find({ where: { employeeId: empId } })
      : [];
    const monthAtt = allAtt.filter((r) =>
      String(r.workDate).startsWith(monthPrefix),
    );
    const monthPresent = monthAtt.filter(
      (r) => !!r.checkInTime || r.status === AttendanceStatus.COMPLETED,
    ).length;
    // Approximate working days elapsed this month (Mon–Fri up to today)
    let monthWorkdays = 0;
    {
      const [y, m] = monthPrefix.split('-').map(Number);
      const cursor = new Date(y, m - 1, 1);
      const end = new Date(`${today}T00:00:00`);
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) monthWorkdays += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    const attendanceRate =
      monthWorkdays > 0
        ? Math.round((monthPresent / monthWorkdays) * 1000) / 10
        : 0;

    const todayAtt = allAtt.find((r) => r.workDate === today) ?? null;
    let workedMinutes: number | null = null;
    if (todayAtt?.checkInTime) {
      const end = todayAtt.checkOutTime
        ? new Date(todayAtt.checkOutTime).getTime()
        : Date.now();
      workedMinutes = Math.max(
        0,
        Math.floor((end - new Date(todayAtt.checkInTime).getTime()) / 60000),
      );
    }

    const myLeave = (await this.leaveRepo.find()).filter(
      (l) => l.employeeId === empId,
    );
    const pendingLeave = myLeave.filter(
      (l) => l.status === LeaveStatus.PENDING,
    );
    const annualUsed = myLeave
      .filter(
        (l) =>
          l.leaveType === LeaveType.ANNUAL &&
          l.status === LeaveStatus.APPROVED &&
          String(l.startDate).startsWith(year),
      )
      .reduce((s, l) => s + (l.daysCount ?? 1), 0);
    const annualQuota = 12;
    const leaveRemaining = Math.max(0, annualQuota - annualUsed);

    const leavePendingItems = pendingLeave.slice(0, 5).map((l) => ({
      id: l.id,
      leaveCode: l.leaveCode || `OFF-${l.id}`,
      leaveType: l.leaveType,
      leaveTypeLabel: LEAVE_TYPE_LABEL[l.leaveType] ?? l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      daysCount: l.daysCount ?? 1,
      reason: l.reason,
      status: l.status,
      createdAt: l.createdAt,
    }));

    return {
      role: UserRole.EMPLOYEE,
      employeeName: emp?.fullName ?? null,
      employeeCode: emp?.employeeCode ?? null,
      position: emp?.position ?? null,
      departmentName: dept?.name ?? null,
      departmentCode: dept?.departmentCode ?? null,
      tasksByStatus: this.countBy(myTasks, 'status'),
      openTasks: openTasks.length,
      highPriorityTasks: highPriority,
      dueSoon: openTasks.filter(
        (t) =>
          t.dueDate &&
          t.dueDate <=
            new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      ).length,
      priorityTasks,
      monthPresent,
      monthWorkdays,
      attendanceRate,
      leavePending: pendingLeave.length,
      leaveRemaining,
      annualQuota,
      annualUsed,
      leavePendingItems,
      attendanceToday: todayAtt
        ? {
            id: todayAtt.id,
            status: todayAtt.status,
            checkedIn: !!todayAtt.checkInTime,
            checkInTime: todayAtt.checkInTime,
            checkOutTime: todayAtt.checkOutTime,
            workedMinutes,
            shiftLabel: 'Ca hành chính',
            shiftStart: '08:30',
            shiftEnd: '17:30',
          }
        : {
            id: null,
            status: null,
            checkedIn: false,
            checkInTime: null,
            checkOutTime: null,
            workedMinutes: null,
            shiftLabel: 'Ca hành chính',
            shiftStart: '08:30',
            shiftEnd: '17:30',
          },
    };
  }

  private async managerOverview(user: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const depts = await this.deptRepo.find({
      where: { managerEmployeeId: user.employeeId ?? undefined },
    });
    const deptIds = depts.map((d) => d.id);
    const primaryDept = depts[0] ?? null;

    const allEmps = await this.empRepo.find({
      where: { status: EmployeeStatus.ACTIVE },
    });
    const scoped = allEmps.filter(
      (e) =>
        e.id === user.employeeId ||
        (e.departmentId != null && deptIds.includes(e.departmentId)),
    );
    const empMap = new Map(scoped.map((e) => [e.id, e]));
    const scopedIds = new Set(scoped.map((e) => e.id));
    const managerEmp = user.employeeId
      ? empMap.get(user.employeeId) ??
        (await this.empRepo.findOne({ where: { id: user.employeeId } }))
      : null;

    const attendanceRows = (
      await this.attRepo.find({ where: { workDate: today } })
    ).filter((r) => scopedIds.has(r.employeeId));

    let onTime = 0;
    let late = 0;
    for (const row of attendanceRows) {
      if (!row.checkInTime) continue;
      const d = new Date(row.checkInTime);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins > LATE_AFTER_MINUTES) late += 1;
      else onTime += 1;
    }
    const checkedIn = onTime + late;
    const teamSize = scoped.length;
    const notCheckedIn = Math.max(0, teamSize - checkedIn);

    const tasks = (await this.taskRepo.find({ order: { updatedAt: 'DESC' } })).filter(
      (t) =>
        (t.assigneeId != null && scopedIds.has(t.assigneeId)) ||
        (t.departmentId != null && deptIds.includes(t.departmentId)) ||
        t.createdBy === user.id ||
        t.reviewerEmployeeId === user.employeeId,
    );
    // de-dupe by id
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const uniqueTasks = [...taskMap.values()];
    const openTasks = uniqueTasks.filter((t) => t.status !== TaskStatus.DONE);
    const inProgress = uniqueTasks.filter(
      (t) =>
        t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.TODO,
    );
    const needReview = uniqueTasks.filter((t) => t.status === TaskStatus.REVIEW);
    const dueSoon = openTasks.filter(
      (t) =>
        t.dueDate &&
        t.dueDate <=
          new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    ).length;

    const pendingLeaves = (await this.leaveRepo.find({
      order: { createdAt: 'DESC' },
    })).filter(
      (l) => scopedIds.has(l.employeeId) && l.status === LeaveStatus.PENDING,
    );

    const headcountTarget =
      depts.reduce((s, d) => s + (d.headcountTarget ?? 0), 0) || null;

    const onTimePct =
      checkedIn > 0 ? Math.round((onTime / checkedIn) * 1000) / 10 : 0;

    const mapTask = (t: Task) => {
      const emp = t.assigneeId ? empMap.get(t.assigneeId) : null;
      const progress =
        t.progress > 0 ? t.progress : this.progressFromStatus(t.status);
      return {
        id: t.id,
        title: t.title,
        projectName: t.projectName,
        assigneeId: t.assigneeId,
        assigneeName: emp?.fullName ?? 'Chưa giao',
        assigneePosition: emp?.position ?? null,
        dueDate: t.dueDate,
        status: t.status,
        priority: t.priority,
        progress,
      };
    };

    const actionItems: {
      id: string;
      kind: string;
      label: string;
      href: string;
      dueHint: string | null;
    }[] = [];

    for (const t of needReview.slice(0, 3)) {
      actionItems.push({
        id: `review-${t.id}`,
        kind: 'REVIEW',
        label: `[Thẩm định task] Review «${t.title}»`,
        href: `/tasks/${t.id}`,
        dueHint: t.dueDate ? `Hạn ${t.dueDate}` : null,
      });
    }
    for (const l of pendingLeaves.slice(0, 2)) {
      const emp = empMap.get(l.employeeId);
      actionItems.push({
        id: `leave-${l.id}`,
        kind: 'LEAVE',
        label: `[Duyệt phép] ${emp?.fullName ?? `NV #${l.employeeId}`} — ${LEAVE_TYPE_LABEL[l.leaveType] ?? l.leaveType}`,
        href: '/leave',
        dueHint: formatShortRange(l.startDate, l.endDate),
      });
    }
    for (const t of openTasks
      .filter(
        (x) =>
          x.dueDate === today &&
          (x.priority === TaskPriority.HIGH ||
            x.priority === TaskPriority.URGENT),
      )
      .slice(0, 2)) {
      if (actionItems.some((a) => a.id === `review-${t.id}`)) continue;
      actionItems.push({
        id: `due-${t.id}`,
        kind: 'DUE',
        label: `[Báo cáo / hạn hôm nay] ${t.title}`,
        href: `/tasks/${t.id}`,
        dueHint: 'Hôm nay',
      });
    }

    return {
      role: UserRole.MANAGER,
      managerName: managerEmp?.fullName ?? 'Quản lý',
      managerPosition: managerEmp?.position ?? 'Trưởng phòng',
      departmentName: primaryDept?.name ?? 'Phòng ban',
      departmentIds: deptIds,
      employees: teamSize,
      headcountTarget,
      workingToday: checkedIn,
      workingPct:
        teamSize > 0 ? Math.round((checkedIn / teamSize) * 1000) / 10 : 0,
      openTasks: openTasks.length,
      inProgressCount: inProgress.length,
      needReviewCount: needReview.length,
      dueSoon,
      pendingLeave: pendingLeaves.length,
      onTime,
      late,
      notCheckedIn,
      onTimePct,
      tasksByStatus: this.countBy(uniqueTasks, 'status'),
      attendance: {
        checkedIn,
        onTime,
        late,
        notCheckedIn,
        onTimePct,
        latePct: checkedIn ? Math.round((late / checkedIn) * 1000) / 10 : 0,
        notCheckedInPct:
          teamSize > 0
            ? Math.round((notCheckedIn / teamSize) * 1000) / 10
            : 0,
      },
      pendingLeaveRequests: pendingLeaves.slice(0, 6).map((l) => {
        const emp = empMap.get(l.employeeId);
        return {
          id: l.id,
          employeeId: l.employeeId,
          employeeName: emp?.fullName ?? `NV #${l.employeeId}`,
          employeePosition: emp?.position ?? null,
          leaveType: l.leaveType,
          leaveTypeLabel:
            LEAVE_TYPE_LABEL[l.leaveType] ?? String(l.leaveType),
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason,
          urgency: l.urgency,
        };
      }),
      activeTasks: openTasks.slice(0, 8).map(mapTask),
      inProgressTasks: inProgress.slice(0, 8).map(mapTask),
      reviewTasks: needReview.slice(0, 8).map(mapTask),
      actionItems: actionItems.slice(0, 5),
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
