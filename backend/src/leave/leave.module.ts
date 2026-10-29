import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { User } from '../users/user.entity';
import { LeaveRequest } from './leave-request.entity';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, Employee, Department, User]),
    SystemLogsModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
