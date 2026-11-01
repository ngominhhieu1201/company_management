import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskPriority, TaskStatus } from '../common/enums';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_code', type: 'varchar', unique: true, nullable: true })
  taskCode: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'project_name', type: 'varchar', nullable: true })
  projectName: string | null;

  @Column({ name: 'created_by' })
  createdBy: number;

  @Column({ name: 'assignee_id', type: 'integer', nullable: true })
  assigneeId: number | null;

  @Column({ name: 'reviewer_employee_id', type: 'integer', nullable: true })
  reviewerEmployeeId: number | null;

  /** JSON array of employee ids */
  @Column({ name: 'collaborator_ids', type: 'text', nullable: true })
  collaboratorIds: string | null;

  @Column({ name: 'department_id', type: 'integer', nullable: true })
  departmentId: number | null;

  @Column({ type: 'varchar', default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ type: 'varchar', default: TaskStatus.TODO })
  status: TaskStatus;

  /** 0–100 */
  @Column({ type: 'integer', default: 0 })
  progress: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'estimated_hours', type: 'integer', nullable: true })
  estimatedHours: number | null;

  @Column({ name: 'actual_hours', type: 'integer', nullable: true })
  actualHours: number | null;

  /** JSON: [{ id, title, category, done }] */
  @Column({ type: 'text', nullable: true })
  criteria: string | null;

  /** JSON: [{ key, originalName, size, mime }] */
  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
