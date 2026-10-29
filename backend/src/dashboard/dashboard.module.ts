import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { Task } from '../tasks/task.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Department,
      Task,
      AttendanceRecord,
      LeaveRequest,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
