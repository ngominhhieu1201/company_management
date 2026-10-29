import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DepartmentStatus } from '../common/enums';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'department_code', unique: true })
  departmentCode: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'manager_employee_id', type: 'integer', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'deputy_employee_id', type: 'integer', nullable: true })
  deputyEmployeeId: number | null;

  @Column({ name: 'parent_department_id', type: 'integer', nullable: true })
  parentDepartmentId: number | null;

  /** Định biên mục tiêu (số NS kế hoạch) — null = chưa cấu hình */
  @Column({ name: 'headcount_target', type: 'integer', nullable: true })
  headcountTarget: number | null;

  @Column({ name: 'founded_at', type: 'date', nullable: true })
  foundedAt: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ name: 'contact_email', type: 'varchar', nullable: true })
  contactEmail: string | null;

  /** ENGINEERING | BUSINESS | SUPPORT | OTHER */
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  /** Tạm ngừng tuyển dụng mới (vẫn ACTIVE) */
  @Column({ name: 'recruitment_paused', default: false })
  recruitmentPaused: boolean;

  @Column({ type: 'varchar', default: DepartmentStatus.ACTIVE })
  status: DepartmentStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
