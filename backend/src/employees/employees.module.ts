import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { LeaveRequest } from '../leave/leave-request.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { Employee } from './employee.entity';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Department,
      User,
      Task,
      AttendanceRecord,
      LeaveRequest,
    ]),
    SystemLogsModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
