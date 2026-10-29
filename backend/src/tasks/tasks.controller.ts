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
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TaskPriority, TaskStatus, UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TasksService } from './tasks.service';

class CreateTaskDto {
  @IsString()
  title: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsInt()
  assigneeId?: number;
  @IsOptional()
  @IsInt()
  departmentId?: number;
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @IsOptional()
  @IsString()
  dueDate?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsInt()
  assigneeId?: number;
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @IsOptional()
  @IsString()
  dueDate?: string;
}

@ApiTags('tasks')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
