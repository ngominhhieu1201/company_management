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
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttendanceService } from './attendance.service';

class FlagDto {
  @IsBoolean()
  flagged: boolean;
}

@ApiTags('attendance')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('stats')
  stats(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.service.stats(user, date);
  }

  @Get('today')
  today(@CurrentUser() user: any) {
    return this.service.todayStatus(user);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('date') date?: string,
    @Query('punctuality') punctuality?: string,
    @Query('status') status?: string,
    @Query('anomalies') anomalies?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('flagged') flagged?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(user, {
      q,
      date,
      punctuality,
      status,
      anomalies,
      departmentId: departmentId ? Number(departmentId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      flagged,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Get('photo/:key')
  async photo(
    @Param('key') key: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const stream = await this.service.getPhotoStream(key, user);
    res.setHeader('Content-Type', 'image/jpeg');
    stream.pipe(res);
  }

  @Post('check-in')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  checkIn(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.checkIn(user, file);
  }

  @Post('check-out')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  checkOut(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.checkOut(user, file);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/flag')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  flag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FlagDto,
    @CurrentUser() user: any,
  ) {
    return this.service.setFlagged(id, dto.flagged, user);
  }
}
