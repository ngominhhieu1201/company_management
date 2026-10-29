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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CheckCodeQueryDto,
  CreateDepartmentDto,
  ListDepartmentsQueryDto,
  UpdateDepartmentDto,
} from './dto/department.dto';
import { DepartmentsService } from './departments.service';

@ApiTags('departments')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('next-code')
  @Roles(UserRole.ADMIN)
  nextCode() {
    return this.service.nextCode();
  }

  @Get('check-code')
  @Roles(UserRole.ADMIN)
  checkCode(@Query() query: CheckCodeQueryDto) {
    return this.service.checkCode(query.code);
  }

  @Get()
  findAll(@Query() query: ListDepartmentsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id/audit')
  audit(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.service.audit(id, limit ? Number(limit) : 40);
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
