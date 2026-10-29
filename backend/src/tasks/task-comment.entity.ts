import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('task_comments')
export class TaskComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @Column({ name: 'author_user_id' })
  authorUserId: number;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
