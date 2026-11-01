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
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.service.stats(user);
  }

  @Get('next-code')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  nextCode() {
    return this.service.nextCode();
  }

  @Post('files')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
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
  async downloadFile(@Param('key') key: string, @Res() res: Response) {
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
  findAll(@CurrentUser() user: any, @Query() query: ListTasksQueryDto) {
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

  @Get(':id/comments')
  comments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.listComments(id, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addComment(id, dto, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }
}
