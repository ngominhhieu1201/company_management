import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { User } from '../users/user.entity';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskComment,
      Employee,
      Department,
      User,
    ]),
    SystemLogsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
