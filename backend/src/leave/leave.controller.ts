import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
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
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  handoverEmployeeId?: number;
  @IsOptional()
  @IsString()
  urgency?: string;
  @IsOptional()
  @IsString()
  attachmentName?: string;
  @IsOptional()
  @IsString()
  attachmentKey?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}

class ReviewLeaveDto {
  @IsEnum({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' })
  decision: 'APPROVED' | 'REJECTED';
  @IsOptional()
  @IsString()
  @MinLength(0)
  comment?: string;
}

@ApiTags('leave')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.service.stats(user);
  }

  @Get('next-code')
  nextCode() {
    return this.service.nextCode();
  }

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.service.saveUploadedFile(file);
  }

  @Get('files/:key')
  downloadFile(@Param('key') key: string, @Res() res: Response) {
    const { stream, key: safe } = this.service.getAttachmentStream(key);
    const lower = safe.toLowerCase();
    const type = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : lower.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `inline; filename="${safe}"`);
    stream.pipe(res);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('leaveType') leaveType?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(user, {
      q,
      status,
      leaveType,
      departmentId: departmentId ? Number(departmentId) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
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

  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.cancel(id, user);
  }
}
