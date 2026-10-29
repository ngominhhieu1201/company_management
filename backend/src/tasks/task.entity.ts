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

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by' })
  createdBy: number;

  @Column({ name: 'assignee_id', type: 'integer', nullable: true })
  assigneeId: number | null;

  @Column({ name: 'department_id', type: 'integer', nullable: true })
  departmentId: number | null;

  @Column({ type: 'varchar', default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ type: 'varchar', default: TaskStatus.TODO })
  status: TaskStatus;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
