import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = this.authService.generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { csrfToken };
  }

  /** Thông tin phiên công khai cho màn login (IP, latency) */
  @Get('session-info')
  sessionInfo(@Req() req: Request) {
    const started = Date.now();
    const sessionIp = this.authService.extractClientIp(req);
    return {
      sessionIp,
      ntpStatus: 'Active',
      latencyMs: Math.max(1, Date.now() - started + 8),
      build: '2.4.8',
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionIp = this.authService.extractClientIp(req);
    const result = await this.authService.login(dto.username, dto.password, {
      rememberMe: dto.rememberMe,
      sessionIp,
    });

    const cookieBase = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: false,
      path: '/',
      maxAge: result.maxAgeMs,
    };
    res.cookie('access_token', result.accessToken, cookieBase);

    const csrfToken = this.authService.generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: result.maxAgeMs,
    });

    return {
      user: result.user,
      csrfToken,
      sessionIp,
      rememberMe: result.rememberMe,
      twoFactorReady: true,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: Record<string, unknown>) {
    return { user };
  }
}
