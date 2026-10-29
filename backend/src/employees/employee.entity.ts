import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmployeeStatus } from '../common/enums';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_code', unique: true })
  employeeCode: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ name: 'department_id', type: 'integer', nullable: true })
  departmentId: number | null;

  @Column({ type: 'varchar', nullable: true })
  position: string;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  @Column({ type: 'varchar', default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
