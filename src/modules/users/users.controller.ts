import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Client,
  type ClientInfo,
} from '../../common/decorators/client-info.decorator.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Roles, STAFF_ROLES } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import { AuthResponseDto } from '../auth/dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import {
  CreateManagerDto,
  UpdateUserByStaffDto,
  UserListResponseDto,
  UserQueryDto,
} from './dto/staff-users.dto.js';
import { UpdateProfileDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ type: UserResponseDto })
  getProfile(@GetUser('id') userId: string): Promise<UserResponseDto> {
    return this.usersService.findOne(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your name, email or avatar' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'The email belongs to another account' })
  updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('me/password')
  @ApiOperation({
    summary: 'Change your password',
    description: 'Signs out every device and returns new tokens for this one.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.usersService.changePassword(userId, dto, client);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Close your account',
    description: 'Deactivates it; orders are kept.',
  })
  @ApiNoContentResponse()
  async closeAccount(@GetUser() user: AuthUser): Promise<void> {
    await this.usersService.closeOwnAccount(user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: "List the store's users, newest first (staff)" })
  @ApiOkResponse({ type: UserListResponseDto })
  list(@Query() query: UserQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

  @Post('managers')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Add a manager account (owner)' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'The phone number or email already has an account',
  })
  createManager(@Body() dto: CreateManagerDto): Promise<UserResponseDto> {
    return this.usersService.createManager(dto);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'One user (staff)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Change a role or block a user (staff)',
    description:
      'The owner can change roles; managers can only block or unblock customers.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse()
  updateUser(
    @GetUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserByStaffDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateByStaff(actor, id, dto);
  }
}
