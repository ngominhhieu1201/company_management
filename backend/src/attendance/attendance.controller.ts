import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: any) {
    return this.service.todayStatus(user);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.findAll(
      user,
      employeeId ? Number(employeeId) : undefined,
    );
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
}
