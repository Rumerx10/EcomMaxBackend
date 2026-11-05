import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ClientInfo } from '../../common/decorators/client-info.decorator.js';
import type { AccessTokenPayload } from '../../common/interfaces/request-with-user.interface.js';
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../../common/utils/password.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { normalizeBdPhone } from '../../common/utils/phone.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import {
  USER_PUBLIC_FIELDS,
  type UserResponseDto,
} from '../users/dto/user-response.dto.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

// Refresh tokens are random strings, stored only as SHA-256 hashes. A fast hash is enough
// because the token itself carries 256 random bits; there is nothing to guess.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const SIGN_IN_AGAIN = 'Your session has ended. Sign in again.';

// Sign-up, sign-in and sessions, always within the current store: the same phone number can
// have separate accounts at two stores. Each sign-in is a Session row; a refresh retires its
// session and opens a new one, and a retired token that comes back signs the user out of all
// devices, because only a copied token can be used twice.
@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    this.refreshTtlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000;
  }

  private get db() {
    return this.tenantPrisma.db;
  }

  async register(
    dto: RegisterDto,
    client: ClientInfo,
  ): Promise<AuthResponseDto> {
    const user = await this.db.user.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        passwordHash: await hashPassword(dto.password),
      },
      select: USER_PUBLIC_FIELDS,
    });
    return this.startSession(user, client);
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<AuthResponseDto> {
    const sellerId = this.tenantPrisma.sellerId;
    // A login that reads as a Bangladeshi number is a phone; anything else a username.
    const phone = dto.phone ?? normalizeBdPhone(dto.login ?? '');
    const user = phone
      ? await this.db.user.findUnique({
          where: { sellerId_phone: { sellerId, phone } },
        })
      : await this.db.user.findUnique({
          where: {
            sellerId_username: {
              sellerId,
              username: (dto.login ?? '').toLowerCase(),
            },
          },
        });
    const valid = user
      ? await verifyPassword(user.passwordHash, dto.password)
      : await verifyAgainstDummy(dto.password);
    if (!user || !valid)
      throw new UnauthorizedException(
        'Wrong phone number, username or password',
      );
    if (!user.isActive)
      throw new UnauthorizedException('This account has been deactivated');

    const signedIn = await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: USER_PUBLIC_FIELDS,
    });
    return this.startSession(signedIn, client);
  }

  async refresh(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<AuthResponseDto> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: USER_PUBLIC_FIELDS } },
    });
    if (!session) throw new UnauthorizedException(SIGN_IN_AGAIN);

    if (session.revokedAt) {
      await this.endAllSessions(session.userId);
      throw new UnauthorizedException(SIGN_IN_AGAIN);
    }
    if (session.expiresAt <= new Date() || !session.user.isActive) {
      throw new UnauthorizedException(SIGN_IN_AGAIN);
    }
    // Retire the session only if nobody else did in the meantime: two refreshes racing with
    // the same token means it was copied.
    const { count } = await this.db.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.endAllSessions(session.userId);
      throw new UnauthorizedException(SIGN_IN_AGAIN);
    }
    return this.startSession(session.user, client);
  }

  // Ends the session of one refresh token. Unknown or already ended tokens are ignored, so
  // signing out twice is harmless.
  async logout(refreshToken: string): Promise<void> {
    await this.db.session.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async endAllSessions(userId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Opens a session for a user who just proved who they are (sign-up, sign-in, checkout,
  // password change) and returns their tokens.
  async startSession(
    user: UserResponseDto,
    client: ClientInfo,
  ): Promise<AuthResponseDto> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.db.session.create({
      data: {
        sellerId: user.sellerId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        userAgent: client.userAgent,
        ipAddress: client.ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    const payload: AccessTokenPayload = {
      sub: user.id,
      sellerId: user.sellerId,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.accessTtlSeconds,
      refreshToken,
      user,
    };
  }
}
