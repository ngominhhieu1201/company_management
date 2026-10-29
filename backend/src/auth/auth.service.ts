import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AccountStatus, UserRole } from '../common/enums';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuthUser, UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly logs: SystemLogsService,
  ) {}

  async validateUser(identifier: string, password: string) {
    const user = await this.usersService.findByLoginIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === AccountStatus.LOCKED) {
      throw new UnauthorizedException('Account is locked');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(
    identifier: string,
    password: string,
    options?: { rememberMe?: boolean; sessionIp?: string },
  ) {
    const user = await this.validateUser(identifier, password);
    const expiresIn = options?.rememberMe ? '30d' : '8h';
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
      },
      { expiresIn },
    );
    await this.usersService.recordLogin(
      user.id,
      options?.sessionIp ?? null,
    );
    await this.logs.log({
      actorUserId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        rememberMe: !!options?.rememberMe,
        sessionIp: options?.sessionIp ?? null,
      },
    });
    const refreshed = await this.usersService.findById(user.id);
    return {
      accessToken: token,
      rememberMe: !!options?.rememberMe,
      maxAgeMs: options?.rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 8 * 60 * 60 * 1000,
      user: this.usersService.toPublic(refreshed ?? user),
    };
  }

  generateCsrfToken() {
    return randomBytes(32).toString('hex');
  }

  getProfile(user: {
    id: number;
    role: string;
    employeeId: number | null;
  }) {
    const actor: AuthUser = {
      id: user.id,
      role: user.role as UserRole,
      employeeId: user.employeeId,
    };
    return this.usersService.getProfile(actor);
  }

  changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    return this.usersService.changePassword(
      userId,
      currentPassword,
      newPassword,
    );
  }

  extractClientIp(req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    ip?: string;
  }): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '0.0.0.0';
  }
}
