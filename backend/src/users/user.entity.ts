import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, UserRole } from '../common/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar' })
  role: UserRole;

  @Column({ type: 'varchar', default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ name: 'employee_id', type: 'integer', nullable: true })
  employeeId: number | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', nullable: true })
  lastLoginIp: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
