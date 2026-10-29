import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AccountStatus } from '../common/enums';
import { Employee } from '../employees/employee.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly logs: SystemLogsService,
  ) {}

  toPublic(user: User) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      employeeId: user.employeeId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findByUsername(username: string) {
    return this.repo.findOne({ where: { username } });
  }

  /** Đăng nhập bằng username hoặc email công vụ (@nexora.work) */
  async findByLoginIdentifier(identifier: string) {
    const raw = identifier.trim();
    const byUsername = await this.findByUsername(raw);
    if (byUsername) return byUsername;

    if (raw.includes('@')) {
      const emp = await this.employees.findOne({
        where: { email: raw.toLowerCase() },
      });
      if (emp) {
        return this.repo.findOne({ where: { employeeId: emp.id } });
      }
    }
    return null;
  }

  async findById(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async findAll() {
    const users = await this.repo.find({ order: { id: 'ASC' } });
    return users.map((u) => this.toPublic(u));
  }

  async create(dto: CreateUserDto, actorId?: number) {
    const exists = await this.findByUsername(dto.username);
    if (exists) throw new BadRequestException('Username already exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      status: AccountStatus.ACTIVE,
      employeeId: dto.employeeId ?? null,
    });
    const saved = await this.repo.save(user);
    await this.logs.log({
      actorUserId: actorId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: saved.id,
      metadata: { username: saved.username, role: saved.role },
    });
    return this.toPublic(saved);
  }

  async update(id: number, dto: UpdateUserDto, actorId?: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.role) user.role = dto.role;
    if (dto.status) user.status = dto.status;
    if (dto.employeeId !== undefined) user.employeeId = dto.employeeId;
    const saved = await this.repo.save(user);
    await this.logs.log({
      actorUserId: actorId,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: saved.id,
      metadata: { role: saved.role, status: saved.status },
    });
    return this.toPublic(saved);
  }
}
