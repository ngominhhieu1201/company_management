import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveStatus, LeaveType } from '../common/enums';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'leave_code', type: 'varchar', nullable: true })
  leaveCode: string | null;

  @Column({ name: 'leave_type', type: 'varchar' })
  leaveType: LeaveType;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'days_count', type: 'real', nullable: true })
  daysCount: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'handover_employee_id', type: 'integer', nullable: true })
  handoverEmployeeId: number | null;

  @Column({ type: 'varchar', default: 'NORMAL' })
  urgency: string;

  @Column({ name: 'attachment_name', type: 'varchar', nullable: true })
  attachmentName: string | null;

  @Column({ name: 'attachment_key', type: 'varchar', nullable: true })
  attachmentKey: string | null;

  @Column({ type: 'varchar', default: LeaveStatus.PENDING })
  status: LeaveStatus;

  @Column({ name: 'review_by', type: 'integer', nullable: true })
  reviewBy: number | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
