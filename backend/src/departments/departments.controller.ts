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
import { DepartmentStatus, UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DepartmentsService } from './departments.service';

class CreateDepartmentDto {
  @IsString()
  departmentCode: string;
  @IsString()
  name: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsInt()
  managerEmployeeId?: number;
}

class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsInt()
  managerEmployeeId?: number | null;
  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}

@ApiTags('departments')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.service.update(id, dto, user.id);
  }
}
