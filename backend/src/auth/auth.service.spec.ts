import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AccountStatus, UserRole } from '../common/enums';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByUsername: jest.fn(),
    findByLoginIdentifier: jest.fn(),
    findById: jest.fn(),
    recordLogin: jest.fn().mockResolvedValue(undefined),
    toPublic: jest.fn((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
      employeeId: u.employeeId,
    })),
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') };
  const logs = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: SystemLogsService, useValue: logs },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('login success', async () => {
    const hash = await bcrypt.hash('Admin@123', 10);
    const user = {
      id: 1,
      username: 'admin',
      passwordHash: hash,
      role: UserRole.ADMIN,
      status: AccountStatus.ACTIVE,
      employeeId: null,
    };
    usersService.findByLoginIdentifier.mockResolvedValue(user);
    usersService.findById.mockResolvedValue(user);
    const result = await service.login('admin', 'Admin@123');
    expect(result.accessToken).toBe('token');
    expect(result.user.username).toBe('admin');
    expect(usersService.recordLogin).toHaveBeenCalled();
  });

  it('login fail wrong password', async () => {
    const hash = await bcrypt.hash('Admin@123', 10);
    usersService.findByLoginIdentifier.mockResolvedValue({
      id: 1,
      username: 'admin',
      passwordHash: hash,
      role: UserRole.ADMIN,
      status: AccountStatus.ACTIVE,
      employeeId: null,
    });
    await expect(service.login('admin', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
