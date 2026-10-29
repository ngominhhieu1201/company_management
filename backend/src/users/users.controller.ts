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
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  stats() {
    return this.usersService.stats();
  }

  @Get('check-username')
  checkUsername(@Query('username') username: string) {
    return this.usersService.checkUsername(username ?? '');
  }

  @Get('unlinked-employees')
  unlinkedEmployees() {
    return this.usersService.listUnlinkedEmployees();
  }

  @Get()
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id/audit')
  audit(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.audit(id, limit ? Number(limit) : 50);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findDetail(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: { id: number }) {
    return this.usersService.create(dto, user.id);
  }

  @Post(':id/reset-password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
  ) {
    return this.usersService.resetPassword(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.usersService.update(id, dto, user.id);
  }
}
