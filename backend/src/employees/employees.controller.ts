import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { EmployeeStatus, UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmployeesService } from './employees.service';

class CreateEmployeeDto {
  @IsString()
  employeeCode: string;
  @IsString()
  fullName: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsInt()
  departmentId?: number;
  @IsOptional()
  @IsString()
  position?: string;
  @IsOptional()
  @IsString()
  hireDate?: string;
}

class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  fullName?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsInt()
  departmentId?: number | null;
  @IsOptional()
  @IsString()
  position?: string;
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

@ApiTags('employees')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('q') q?: string) {
    return this.service.findAll(user, q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }
}
