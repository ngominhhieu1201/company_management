import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountStatus } from '../common/enums';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'company-mgmt-dev-secret-change-me',
    });
  }

  async validate(payload: { sub: number; username: string; role: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
    };
  }
}
