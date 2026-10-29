import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { LeaveType, UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LeaveService } from './leave.service';

class CreateLeaveDto {
  @IsEnum(LeaveType)
  leaveType: LeaveType;
  @IsString()
  startDate: string;
  @IsString()
  endDate: string;
  @IsOptional()
  @IsString()
  reason?: string;
}

class ReviewLeaveDto {
  @IsEnum({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' })
  decision: 'APPROVED' | 'REJECTED';
  @IsOptional()
  @IsString()
  comment?: string;
}

@ApiTags('leave')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  create(@Body() dto: CreateLeaveDto, @CurrentUser() user: any) {
    return this.service.create(user, dto);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: any,
  ) {
    return this.service.review(id, user, dto.decision, dto.comment);
  }
}
