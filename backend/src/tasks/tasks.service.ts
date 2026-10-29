import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TaskStatus, UserRole } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { User } from '../users/user.entity';
import {
  CreateCommentDto,
  CreateTaskDto,
  CriterionDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';

type AuthUser = { id: number; role: UserRole; employeeId: number | null };

type Criterion = {
  id: string;
  title: string;
  category: string | null;
  done: boolean;
};

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultProgress(status: TaskStatus) {
  if (status === TaskStatus.DONE) return 100;
  if (status === TaskStatus.REVIEW) return 85;
  if (status === TaskStatus.IN_PROGRESS) return 40;
  return 0;
}

function parseCriteria(raw: string | null): Criterion[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as CriterionDto[];
    if (!Array.isArray(arr)) return [];
    return arr.map((c, i) => ({
      id: c.id || `c${i + 1}`,
      title: c.title,
      category: c.category || null,
      done: !!c.done,
    }));
  } catch {
    return [];
  }
}

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as number[];
    return Array.isArray(arr)
      ? arr.map(Number).filter((n) => Number.isInteger(n))
      : [];
  } catch {
    return [];
  }
}

function progressFromCriteria(criteria: Criterion[], fallback: number) {
  if (!criteria.length) return fallback;
  const done = criteria.filter((c) => c.done).length;
  return Math.round((done / criteria.length) * 100);
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly repo: Repository<Task>,
    @InjectRepository(TaskComment)
    private readonly comments: Repository<TaskComment>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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

  private slaOf(t: Task, today: string) {
    if (!t.dueDate || t.status === TaskStatus.DONE) return 'ok' as const;
    if (t.dueDate < today) return 'overdue' as const;
    if (t.dueDate === today) return 'today' as const;
    if (t.dueDate <= addDays(today, 3)) return 'soon' as const;
    if (t.dueDate <= addDays(today, 7)) return 'week' as const;
    return 'ok' as const;
  }

  private empBrief(e: Employee | undefined) {
    if (!e) return null;
    return {
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      position: e.position,
      departmentId: e.departmentId,
    };
  }

  private async enrich(tasks: Task[]) {
    const emps = await this.empRepo.find();
    const depts = await this.deptRepo.find();
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const today = todayStr();

    return tasks.map((t) => {
      const criteria = parseCriteria(t.criteria);
      const collabIds = parseIds(t.collaboratorIds);
      const assignee =
        t.assigneeId != null ? empMap.get(t.assigneeId) : undefined;
      const reviewer =
        t.reviewerEmployeeId != null
          ? empMap.get(t.reviewerEmployeeId)
          : undefined;
      const dept =
        t.departmentId != null
          ? deptMap.get(t.departmentId)
          : assignee?.departmentId != null
            ? deptMap.get(assignee.departmentId)
            : undefined;
      const progress =
        criteria.length > 0
          ? progressFromCriteria(criteria, t.progress ?? 0)
          : (t.progress ?? defaultProgress(t.status));
      return {
        id: t.id,
        taskCode: t.taskCode || `TSK-${t.id}`,
        title: t.title,
        description: t.description,
        projectName: t.projectName,
        createdBy: t.createdBy,
        assigneeId: t.assigneeId,
        assignee: this.empBrief(assignee),
        reviewerEmployeeId: t.reviewerEmployeeId,
        reviewer: this.empBrief(reviewer),
        collaboratorIds: collabIds,
        collaborators: collabIds
          .map((id) => this.empBrief(empMap.get(id)))
          .filter(Boolean),
        departmentId: t.departmentId ?? assignee?.departmentId ?? null,
        department: dept
          ? {
              id: dept.id,
              name: dept.name,
              departmentCode: dept.departmentCode,
            }
          : null,
        priority: t.priority,
        status: t.status,
        progress,
        startDate: t.startDate,
        dueDate: t.dueDate,
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        criteria,
        criteriaDone: criteria.filter((c) => c.done).length,
        criteriaTotal: criteria.length,
        sla: this.slaOf(t, today),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });
  }

  private async scopedTasks(user: AuthUser) {
    const scope = await this.scopeEmployeeIds(user);
    const all = await this.repo.find({ order: { id: 'DESC' } });
    if (scope === null) return all;
    return all.filter((t) => {
      const collab = parseIds(t.collaboratorIds);
      return (
        (t.assigneeId != null && scope.includes(t.assigneeId)) ||
        (t.reviewerEmployeeId != null &&
          scope.includes(t.reviewerEmployeeId)) ||
        collab.some((id) => scope.includes(id)) ||
        t.createdBy === user.id
      );
    });
  }

  private canAccessTask(task: Task, user: AuthUser, scope: number[] | null) {
    if (scope === null) return true;
    const collab = parseIds(task.collaboratorIds);
    return (
      (task.assigneeId != null && scope.includes(task.assigneeId)) ||
      (task.reviewerEmployeeId != null &&
        scope.includes(task.reviewerEmployeeId)) ||
      collab.some((id) => scope.includes(id)) ||
      task.createdBy === user.id
    );
  }

  async stats(user: AuthUser) {
    const tasks = await this.scopedTasks(user);
    const rows = await this.enrich(tasks);
    const today = todayStr();
    const weekStart = startOfWeek(today);
    const active = rows.filter((t) => t.status !== TaskStatus.DONE).length;
    const inProgress = rows.filter(
      (t) => t.status === TaskStatus.IN_PROGRESS,
    ).length;
    const review = rows.filter((t) => t.status === TaskStatus.REVIEW).length;
    const doneSprint = rows.filter((t) => {
      if (t.status !== TaskStatus.DONE) return false;
      const updated = new Date(t.updatedAt).toISOString().slice(0, 10);
      return updated >= weekStart && updated <= today;
    }).length;
    const mine = user.employeeId
      ? rows.filter((t) => t.assigneeId === user.employeeId).length
      : 0;
    const urgent = rows.filter(
      (t) => t.priority === 'URGENT' && t.status !== TaskStatus.DONE,
    ).length;
    const soonSla = rows.filter(
      (t) => t.sla === 'soon' || t.sla === 'today' || t.sla === 'overdue',
    ).length;
    const overdue = rows.filter((t) => t.sla === 'overdue').length;
    const open = rows.filter((t) => t.status !== TaskStatus.DONE);
    const avgProgress =
      open.length > 0
        ? Math.round(
            (open.reduce((s, t) => s + t.progress, 0) / open.length) * 10,
          ) / 10
        : 0;
    return {
      total: rows.length,
      active,
      inProgress,
      review,
      doneSprint,
      mine,
      urgent,
      soonSla,
      overdue,
      avgProgress,
      byPriority: {
        URGENT: rows.filter((t) => t.priority === 'URGENT').length,
        HIGH: rows.filter((t) => t.priority === 'HIGH').length,
        MEDIUM: rows.filter((t) => t.priority === 'MEDIUM').length,
        LOW: rows.filter((t) => t.priority === 'LOW').length,
      },
      byStatus: {
        TODO: rows.filter((t) => t.status === TaskStatus.TODO).length,
        IN_PROGRESS: inProgress,
        REVIEW: review,
        DONE: rows.filter((t) => t.status === TaskStatus.DONE).length,
      },
    };
  }

  async findAll(user: AuthUser, query: ListTasksQueryDto = {}) {
    let tasks = await this.scopedTasks(user);
    let rows = await this.enrich(tasks);

    const q = query.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((t) => {
        const hay = [
          t.taskCode,
          t.title,
          t.description,
          t.projectName,
          t.assignee?.fullName,
          t.department?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (query.priority) rows = rows.filter((t) => t.priority === query.priority);
    if (query.status) rows = rows.filter((t) => t.status === query.status);
    if (query.departmentId)
      rows = rows.filter((t) => t.departmentId === query.departmentId);
    if (query.assigneeId)
      rows = rows.filter((t) => t.assigneeId === query.assigneeId);
    if (query.scope === 'mine' && user.employeeId) {
      rows = rows.filter((t) => t.assigneeId === user.employeeId);
    }
    if (query.scope === 'urgent') {
      rows = rows.filter(
        (t) => t.priority === 'URGENT' && t.status !== TaskStatus.DONE,
      );
    }
    if (query.sla && query.sla !== 'all') {
      if (query.sla === 'overdue')
        rows = rows.filter((t) => t.sla === 'overdue');
      else if (query.sla === 'today')
        rows = rows.filter((t) => t.sla === 'today');
      else if (query.sla === 'soon')
        rows = rows.filter(
          (t) =>
            t.sla === 'soon' || t.sla === 'today' || t.sla === 'overdue',
        );
      else if (query.sla === 'week')
        rows = rows.filter(
          (t) =>
            t.sla === 'today' ||
            t.sla === 'week' ||
            t.sla === 'soon' ||
            t.sla === 'overdue',
        );
    }

    const sort = query.sort || 'due_asc';
    rows = [...rows].sort((a, b) => {
      if (sort === 'priority') {
        const order = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
      }
      if (sort === 'created_desc') {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (!a.dueDate && !b.dueDate) return b.id - a.id;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return { items, total, page, pageSize, totalPages };
  }

  async findOne(id: number, user: AuthUser) {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    const scope = await this.scopeEmployeeIds(user);
    if (!this.canAccessTask(task, user, scope)) throw new ForbiddenException();
    const [row] = await this.enrich([task]);
    const creator = await this.users.findOne({ where: { id: task.createdBy } });
    let reporter = null as ReturnType<TasksService['empBrief']> | null;
    if (creator?.employeeId) {
      const emp = await this.empRepo.findOne({
        where: { id: creator.employeeId },
      });
      reporter = this.empBrief(emp || undefined);
    }
    return {
      ...row,
      reporter,
      reporterUsername: creator?.username || null,
    };
  }

  async audit(id: number, user: AuthUser, limit = 40) {
    await this.findOne(id, user);
    const logs = await this.logs.findForEntity('Task', id, limit);
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
        actorUsername:
          l.actorUserId != null
            ? (map.get(l.actorUserId) ?? `user#${l.actorUserId}`)
            : 'SYSTEM',
        metadata: meta,
      };
    });
  }

  async listComments(id: number, user: AuthUser) {
    await this.findOne(id, user);
    const rows = await this.comments.find({
      where: { taskId: id },
      order: { createdAt: 'ASC' },
    });
    const userIds = [...new Set(rows.map((r) => r.authorUserId))];
    const users =
      userIds.length > 0
        ? await this.users.find({ where: { id: In(userIds) } })
        : [];
    const uMap = new Map(users.map((u) => [u.id, u]));
    const empIds = users
      .map((u) => u.employeeId)
      .filter((x): x is number => x != null);
    const emps =
      empIds.length > 0
        ? await this.empRepo.find({ where: { id: In(empIds) } })
        : [];
    const eMap = new Map(emps.map((e) => [e.id, e]));
    return rows.map((r) => {
      const u = uMap.get(r.authorUserId);
      const emp = u?.employeeId != null ? eMap.get(u.employeeId) : undefined;
      return {
        id: r.id,
        body: r.body,
        createdAt: r.createdAt,
        authorUserId: r.authorUserId,
        authorUsername: u?.username || `user#${r.authorUserId}`,
        authorName: emp?.fullName || u?.username || 'User',
      };
    });
  }

  async addComment(id: number, dto: CreateCommentDto, user: AuthUser) {
    await this.findOne(id, user);
    const saved = await this.comments.save(
      this.comments.create({
        taskId: id,
        authorUserId: user.id,
        body: dto.body.trim(),
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'TASK_COMMENT',
      entityType: 'Task',
      entityId: id,
    });
    const [row] = await this.listComments(id, user);
    void row;
    const list = await this.listComments(id, user);
    return list.find((c) => c.id === saved.id) || list[list.length - 1];
  }

  async nextCode() {
    const year = new Date().getFullYear();
    const prefix = `TSK-${year}-`;
    const all = await this.repo.find();
    let max = 0;
    for (const t of all) {
      if (!t.taskCode?.startsWith(prefix)) continue;
      const n = Number(t.taskCode.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    // also count legacy CV-
    const legacy = `CV-${year}-`;
    for (const t of all) {
      if (!t.taskCode?.startsWith(legacy)) continue;
      const n = Number(t.taskCode.slice(legacy.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    const sequence = max + 1;
    return {
      taskCode: `${prefix}${String(sequence).padStart(3, '0')}`,
      year,
      sequence,
    };
  }

  private normalizeCriteria(list?: CriterionDto[]): Criterion[] {
    if (!list?.length) return [];
    return list.map((c, i) => ({
      id: c.id || `c${Date.now()}_${i}`,
      title: c.title.trim(),
      category: c.category?.trim() || null,
      done: !!c.done,
    }));
  }

  async create(dto: CreateTaskDto, user: AuthUser) {
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();
    if (dto.assigneeId != null) {
      const emp = await this.empRepo.findOne({ where: { id: dto.assigneeId } });
      if (!emp) throw new BadRequestException('Assignee not found');
    }
    let departmentId = dto.departmentId ?? null;
    if (departmentId == null && dto.assigneeId != null) {
      const emp = await this.empRepo.findOne({ where: { id: dto.assigneeId } });
      departmentId = emp?.departmentId ?? null;
    }
    const criteria = this.normalizeCriteria(dto.criteria);
    const { taskCode } = await this.nextCode();
    const status = TaskStatus.TODO;
    const progress =
      criteria.length > 0
        ? progressFromCriteria(criteria, 0)
        : (dto.progress ?? defaultProgress(status));

    const task = await this.repo.save(
      this.repo.create({
        taskCode,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        projectName: dto.projectName?.trim() || null,
        createdBy: user.id,
        assigneeId: dto.assigneeId ?? null,
        reviewerEmployeeId: dto.reviewerEmployeeId ?? null,
        collaboratorIds: dto.collaboratorIds?.length
          ? JSON.stringify(dto.collaboratorIds)
          : null,
        departmentId,
        priority: dto.priority,
        status,
        progress,
        startDate: dto.startDate || null,
        dueDate: dto.dueDate || null,
        estimatedHours: dto.estimatedHours ?? null,
        actualHours: null,
        criteria: criteria.length ? JSON.stringify(criteria) : null,
      }),
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'TASK_CREATE',
      entityType: 'Task',
      entityId: task.id,
      metadata: { taskCode },
    });
    return this.findOne(task.id, user);
  }

  async update(id: number, dto: UpdateTaskDto, user: AuthUser) {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    const scope = await this.scopeEmployeeIds(user);
    if (!this.canAccessTask(task, user, scope)) throw new ForbiddenException();
    const prevStatus = task.status;

    if (user.role === UserRole.EMPLOYEE) {
      if (task.assigneeId !== user.employeeId) throw new ForbiddenException();
      if (dto.status !== undefined) {
        task.status = dto.status;
        if (dto.progress === undefined && !dto.criteria) {
          task.progress = defaultProgress(dto.status);
        }
      }
      if (dto.progress !== undefined) task.progress = dto.progress;
      if (dto.description !== undefined) task.description = dto.description;
      if (dto.actualHours !== undefined) task.actualHours = dto.actualHours;
      if (dto.criteria !== undefined) {
        const criteria = this.normalizeCriteria(dto.criteria);
        task.criteria = criteria.length ? JSON.stringify(criteria) : null;
        task.progress = progressFromCriteria(criteria, task.progress);
      }
    } else {
      if (dto.title !== undefined) task.title = dto.title.trim();
      if (dto.description !== undefined) task.description = dto.description;
      if (dto.projectName !== undefined) task.projectName = dto.projectName;
      if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId;
      if (dto.reviewerEmployeeId !== undefined)
        task.reviewerEmployeeId = dto.reviewerEmployeeId;
      if (dto.collaboratorIds !== undefined) {
        task.collaboratorIds = dto.collaboratorIds?.length
          ? JSON.stringify(dto.collaboratorIds)
          : null;
      }
      if (dto.departmentId !== undefined) task.departmentId = dto.departmentId;
      if (dto.priority !== undefined) task.priority = dto.priority;
      if (dto.status !== undefined) {
        task.status = dto.status;
        if (dto.progress === undefined && !dto.criteria) {
          task.progress = defaultProgress(dto.status);
        }
      }
      if (dto.startDate !== undefined) task.startDate = dto.startDate;
      if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;
      if (dto.estimatedHours !== undefined)
        task.estimatedHours = dto.estimatedHours;
      if (dto.actualHours !== undefined) task.actualHours = dto.actualHours;
      if (dto.progress !== undefined) task.progress = dto.progress;
      if (dto.criteria !== undefined) {
        const criteria = this.normalizeCriteria(dto.criteria);
        task.criteria = criteria.length ? JSON.stringify(criteria) : null;
        if (dto.progress === undefined) {
          task.progress = progressFromCriteria(criteria, task.progress);
        }
      }
    }

    if (!task.taskCode) {
      const { taskCode } = await this.nextCode();
      task.taskCode = taskCode;
    }

    const saved = await this.repo.save(task);
    await this.logs.log({
      actorUserId: user.id,
      action:
        dto.status && dto.status !== prevStatus
          ? 'TASK_STATUS_CHANGE'
          : 'TASK_UPDATE',
      entityType: 'Task',
      entityId: saved.id,
      metadata: {
        status: saved.status,
        prevStatus,
        progress: saved.progress,
      },
    });
    return this.findOne(saved.id, user);
  }
}
