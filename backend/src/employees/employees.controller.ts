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
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.service.stats(user);
  }

  @Get('options')
  options(@CurrentUser() user: any) {
    return this.service.findOptions(user);
  }

  @Get('next-code')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  nextCode() {
    return this.service.nextCode();
  }

  @Get('photo/:key')
  async photo(@Param('key') key: string, @Res() res: Response) {
    const stream = await this.service.getPhotoStream(key);
    const lower = key.toLowerCase();
    const type = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    res.setHeader('Content-Type', type);
    stream.pipe(res);
  }

  @Get()
  findAll(@CurrentUser() user: any, @Query() query: ListEmployeesQueryDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id/audit')
  audit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return this.service.audit(id, user, limit ? Number(limit) : 40);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Post(':id/photo')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.service.uploadPhoto(id, file, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }
}
