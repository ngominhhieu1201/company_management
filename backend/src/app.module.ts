import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { SeedModule } from './seed/seed.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(process.cwd(), 'company.db'),
      autoLoadEntities: true,
      synchronize: true,
    }),
    AuthModule,
    UsersModule,
    EmployeesModule,
    DepartmentsModule,
    TasksModule,
    AttendanceModule,
    LeaveModule,
    DashboardModule,
    SystemLogsModule,
    SeedModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
