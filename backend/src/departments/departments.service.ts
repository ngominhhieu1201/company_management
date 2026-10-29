import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentStatus } from '../common/enums';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Department } from './department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly repo: Repository<Department>,
    private readonly logs: SystemLogsService,
  ) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Department not found');
    return d;
  }

  async create(
    data: Partial<Department>,
    actorId?: number,
  ) {
    const exists = await this.repo.findOne({
      where: { departmentCode: data.departmentCode },
    });
    if (exists) throw new BadRequestException('Department code exists');
    const saved = await this.repo.save(
      this.repo.create({
        ...data,
        status: data.status ?? DepartmentStatus.ACTIVE,
      }),
    );
    await this.logs.log({
      actorUserId: actorId,
      action: 'DEPARTMENT_CREATE',
      entityType: 'Department',
      entityId: saved.id,
    });
    return saved;
  }

  async update(id: number, data: Partial<Department>, actorId?: number) {
    const dept = await this.findOne(id);
    Object.assign(dept, data);
    const saved = await this.repo.save(dept);
    await this.logs.log({
      actorUserId: actorId,
      action: 'DEPARTMENT_UPDATE',
      entityType: 'Department',
      entityId: saved.id,
    });
    return saved;
  }
}
