import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  DepartmentStatus,
  EmployeeStatus,
  UserRole,
} from '../common/enums';
import { Department } from '../departments/department.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
  ) {}

  async onModuleInit() {
    // Đồng bộ domain email demo nếu DB cũ còn @company.local
    const legacy = await this.employees.find();
    for (const emp of legacy) {
      if (emp.email?.endsWith('@company.local')) {
        emp.email = emp.email.replace('@company.local', '@nexora.work');
        await this.employees.save(emp);
      }
    }

    const count = await this.users.count();
    if (count > 0) return;

    const dept = await this.departments.save(
      this.departments.create({
        departmentCode: 'IT',
        name: 'Công nghệ thông tin',
        description: 'Phòng CNTT',
        status: DepartmentStatus.ACTIVE,
      }),
    );

    const managerEmp = await this.employees.save(
      this.employees.create({
        employeeCode: 'NV001',
        fullName: 'Nguyễn Quản Lý',
        email: 'manager@nexora.work',
        phone: '0901000001',
        departmentId: dept.id,
        position: 'Trưởng phòng',
        hireDate: '2022-01-10',
        status: EmployeeStatus.ACTIVE,
      }),
    );

    const employeeEmp = await this.employees.save(
      this.employees.create({
        employeeCode: 'NV002',
        fullName: 'Trần Nhân Viên',
        email: 'employee@nexora.work',
        phone: '0901000002',
        departmentId: dept.id,
        position: 'Nhân viên',
        hireDate: '2023-03-15',
        status: EmployeeStatus.ACTIVE,
      }),
    );

    const adminEmp = await this.employees.save(
      this.employees.create({
        employeeCode: 'NV000',
        fullName: 'Admin Hệ thống',
        email: 'admin@nexora.work',
        phone: '0901000000',
        departmentId: dept.id,
        position: 'Quản trị',
        hireDate: '2020-01-01',
        status: EmployeeStatus.ACTIVE,
      }),
    );

    dept.managerEmployeeId = managerEmp.id;
    await this.departments.save(dept);

    const hash = async (p: string) => bcrypt.hash(p, 10);

    await this.users.save([
      this.users.create({
        username: 'admin',
        passwordHash: await hash('Admin@123'),
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        employeeId: adminEmp.id,
      }),
      this.users.create({
        username: 'manager',
        passwordHash: await hash('Manager@123'),
        role: UserRole.MANAGER,
        status: AccountStatus.ACTIVE,
        employeeId: managerEmp.id,
      }),
      this.users.create({
        username: 'employee',
        passwordHash: await hash('Employee@123'),
        role: UserRole.EMPLOYEE,
        status: AccountStatus.ACTIVE,
        employeeId: employeeEmp.id,
      }),
    ]);
  }
}
