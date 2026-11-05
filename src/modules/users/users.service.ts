import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientInfo } from '../../common/decorators/client-info.decorator.js';
import { toCursorPage } from '../../common/dto/cursor-query.dto.js';
import type { AuthUser } from '../../common/interfaces/request-with-user.interface.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { normalizeBdPhone } from '../../common/utils/phone.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthResponseDto } from '../auth/dto/auth-response.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type {
  CreateManagerDto,
  UpdateUserByStaffDto,
  UserListResponseDto,
  UserQueryDto,
} from './dto/staff-users.dto.js';
import type { UpdateProfileDto } from './dto/update-user.dto.js';
import {
  USER_PUBLIC_FIELDS,
  type UserResponseDto,
} from './dto/user-response.dto.js';

// Accounts of the current store. Users with orders are never deleted (orders keep pointing
// at them); closing an account deactivates it and ends its sessions instead.
@Injectable()
export class UsersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auth: AuthService,
  ) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.db.user.findUnique({
      where: { id },
      select: USER_PUBLIC_FIELDS,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.db.user.update({
      where: { id: userId },
      data: dto,
      select: USER_PUBLIC_FIELDS,
    });
  }

  // Ends every session, including other devices that might belong to whoever knew the old
  // password, and signs this device back in.
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    client: ClientInfo,
  ): Promise<AuthResponseDto> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Your current password is not correct');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }
    const updated = await this.db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.newPassword) },
      select: USER_PUBLIC_FIELDS,
    });
    await this.auth.endAllSessions(userId);
    return this.auth.startSession(updated, client);
  }

  async closeOwnAccount(user: AuthUser): Promise<void> {
    if (user.role === 'OWNER') {
      throw new ForbiddenException('The store owner account cannot be closed');
    }
    await this.db.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await this.auth.endAllSessions(user.id);
  }

  async list(query: UserQueryDto): Promise<UserListResponseDto> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      const phone = normalizeBdPhone(query.search);
      if (phone) where.phone = phone;
      else where.name = { contains: query.search, mode: 'insensitive' };
    }
    // Newest first; (sellerId, role, createdAt) covers the common "customers" listing.
    const rows = await this.db.user.findMany({
      where,
      select: USER_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, query.limit);
  }

  async createManager(dto: CreateManagerDto): Promise<UserResponseDto> {
    return this.db.user.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        role: 'MANAGER',
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        passwordHash: await hashPassword(dto.password),
      },
      select: USER_PUBLIC_FIELDS,
    });
  }

  // The owner may change anyone but themselves; managers may only (de)activate customers.
  async updateByStaff(
    actor: AuthUser,
    id: string,
    dto: UpdateUserByStaffDto,
  ): Promise<UserResponseDto> {
    const target = await this.db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === actor.id) {
      throw new ForbiddenException('Change your own account from your profile');
    }
    if (target.role === 'OWNER') {
      throw new ForbiddenException('The owner account cannot be changed here');
    }
    if (actor.role === 'MANAGER') {
      if (dto.role !== undefined)
        throw new ForbiddenException('Only the owner can change roles');
      if (target.role !== 'CUSTOMER') {
        throw new ForbiddenException(
          'Managers can only change customer accounts',
        );
      }
    }
    const updated = await this.db.user.update({
      where: { id },
      data: { role: dto.role, isActive: dto.isActive },
      select: USER_PUBLIC_FIELDS,
    });
    // New role or blocked account: old sessions must not keep the old rights. Access tokens
    // already issued stay valid until they expire (JWT_ACCESS_TTL_SECONDS).
    if (dto.isActive === false || (dto.role && dto.role !== target.role)) {
      await this.auth.endAllSessions(id);
    }
    return updated;
  }
}
