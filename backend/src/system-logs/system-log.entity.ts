import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('system_logs')
export class SystemLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'actor_user_id', type: 'integer', nullable: true })
  actorUserId: number | null;

  @Column()
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', nullable: true })
  result: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
