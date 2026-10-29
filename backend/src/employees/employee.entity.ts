import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ContractType,
  EmployeeGender,
  EmployeeStatus,
} from '../common/enums';

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

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', nullable: true })
  gender: EmployeeGender | null;

  @Column({ name: 'national_id', type: 'varchar', nullable: true })
  nationalId: string | null;

  @Column({ name: 'permanent_address', type: 'text', nullable: true })
  permanentAddress: string | null;

  @Column({ name: 'temporary_address', type: 'text', nullable: true })
  temporaryAddress: string | null;

  @Column({ name: 'manager_employee_id', type: 'integer', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'contract_type', type: 'varchar', nullable: true })
  contractType: ContractType | null;

  @Column({ name: 'photo_key', type: 'varchar', nullable: true })
  photoKey: string | null;

  @Column({ type: 'varchar', default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
