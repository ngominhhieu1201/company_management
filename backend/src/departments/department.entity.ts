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

  @Column({ type: 'varchar', default: DepartmentStatus.ACTIVE })
  status: DepartmentStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
