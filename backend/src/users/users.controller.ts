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
  UnlockRequestDto,
  UpdateUserDto,
} from './dto/user.dto';
import { AuthUser, UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  stats(@CurrentUser() user: AuthUser) {
    return this.usersService.stats(user);
  }

  @Get('check-username')
  @Roles(UserRole.ADMIN)
  checkUsername(@Query('username') username: string) {
    return this.usersService.checkUsername(username ?? '');
  }

  @Get('unlinked-employees')
  @Roles(UserRole.ADMIN)
  unlinkedEmployees() {
    return this.usersService.listUnlinkedEmployees();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.findAll(query, user);
  }

  @Get(':id/audit')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  audit(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.usersService.audit(id, limit ? Number(limit) : 50, user);
  }

  @Post(':id/unlock-request')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  unlockRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UnlockRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.requestUnlock(id, user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.findDetail(id, user);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.id);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.resetPassword(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, dto, user.id);
  }
}
