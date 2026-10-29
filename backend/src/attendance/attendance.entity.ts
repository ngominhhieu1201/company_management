import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceStatus } from '../common/enums';

@Entity('attendance_records')
@Unique(['employeeId', 'workDate'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ name: 'check_in_time', type: 'datetime', nullable: true })
  checkInTime: Date | null;

  @Column({ name: 'check_in_photo_key', type: 'varchar', nullable: true })
  checkInPhotoKey: string | null;

  @Column({ name: 'check_out_time', type: 'datetime', nullable: true })
  checkOutTime: Date | null;

  @Column({ name: 'check_out_photo_key', type: 'varchar', nullable: true })
  checkOutPhotoKey: string | null;

  @Column({ type: 'varchar', default: AttendanceStatus.IN_PROGRESS })
  status: AttendanceStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
