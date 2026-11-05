import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  Client,
  type ClientInfo,
} from '../../common/decorators/client-info.decorator.js';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AllowPendingStore } from '../../tenant/tenant.decorators.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

// Brute-force protection on top of the global limit; per client IP.
const SIGN_IN_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@ApiTooManyRequestsResponse({ description: 'Too many attempts; wait a minute' })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @ApiOperation({
    summary: 'Create a customer account at this store and sign in',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    description: 'The phone number or email already has an account',
  })
  register(
    @Body() dto: RegisterDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, client);
  }

  @Post('login')
  @Public()
  @AllowPendingStore()
  @Throttle(SIGN_IN_LIMIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with phone number and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Wrong phone number or password' })
  login(
    @Body() dto: LoginDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, client);
  }

  @Post('refresh')
  @Public()
  @AllowPendingStore()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Swap a refresh token for new tokens',
    description:
      'The old refresh token stops working. Reusing it signs out every device.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'The session ended; sign in again' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken, client);
  }

  @Post('logout')
  @Public()
  @AllowPendingStore()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out this device' })
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @AllowPendingStore()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sign out every device of the signed-in user' })
  @ApiNoContentResponse()
  async logoutAll(@GetUser('id') userId: string): Promise<void> {
    await this.authService.endAllSessions(userId);
  }
}
