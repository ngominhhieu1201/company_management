import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from '../attendance/attendance.entity';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { Task } from '../tasks/task.entity';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Employee,
      Department,
      Task,
      AttendanceRecord,
    ]),
    SystemLogsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

