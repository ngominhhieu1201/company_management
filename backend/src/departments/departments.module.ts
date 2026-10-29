import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { Department } from './department.entity';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Department,
      Employee,
      User,
      Task,
      AttendanceRecord,
    ]),
    SystemLogsModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
