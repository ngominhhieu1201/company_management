import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SystemLogsService } from './system-logs.service';

@ApiTags('system-logs')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly service: SystemLogsService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    return this.service.findAll(limit ? Number(limit) : 100);
  }
}
